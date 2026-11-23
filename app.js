/**
 * PontoGPS Pro — Controle de Ponto, Horas Extras e Férias
 * Gestão de jornada de trabalho com geofencing, cálculo automático de horas extras e férias CLT.
 */

(function () {
  'use strict';

  // --- Chaves do LocalStorage ---
  const STORAGE_KEYS = {
    ENTRIES: 'pontogps_entries',
    VACATIONS: 'pontogps_vacations',
    CONFIG: 'pontogps_config',
    CURRENT_DAY: 'pontogps_current_day',
    THEME: 'pontogps_theme'
  };

  // --- Configurações Padrão ---
  const DEFAULT_CONFIG = {
    hourlyRate: 25.00,        // R$ 25,00 por hora
    overtimePercentage: 50,   // 50% de adicional
    monthlySalary: 4400.00,    // Salário base referência para férias
    standardStartTime: '08:00', // Início do horário normal
    standardEndTime: '17:00',   // Término do horário normal
    lunchMinutes: 60,         // 60 minutos de intervalo
    workLocation: {
      name: 'Sede da Empresa',
      lat: -23.561684,         // Av. Paulista, São Paulo (Exemplo padrão)
      lng: -46.655981,
      radius: 150              // 150 metros de raio de tolerância
    }
  };

  // --- Registros de Demonstração (Mês Atual) ---
  function getSampleData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    return [
      {
        id: 'entry-1',
        date: `${year}-${month}-03`,
        startTime: '07:30',
        endTime: '17:45',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 25.00,
        notes: 'Chegada antecipada e fechamento de relatório'
      },
      {
        id: 'entry-2',
        date: `${year}-${month}-04`,
        startTime: '07:45',
        endTime: '18:30',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 25.00,
        notes: 'Horas extras na saída para reunião com cliente'
      },
      {
        id: 'entry-3',
        date: `${year}-${month}-05`,
        startTime: '08:00',
        endTime: '17:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 25.00,
        notes: 'Jornada normal padrão'
      },
      {
        id: 'entry-4',
        date: `${year}-${month}-06`,
        startTime: '07:15',
        endTime: '17:15',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 25.00,
        notes: 'Entrada 45min antes das 8h'
      }
    ];
  }

  function getSampleVacations() {
    const now = new Date();
    const year = now.getFullYear();
    return [
      {
        id: 'vac-1',
        startDate: `${year}-01-10`,
        days: 15,
        baseSalary: 4400.00,
        vacationValue: 2200.00,
        oneThirdBonus: 733.33,
        totalValue: 2933.33,
        soldAbono: false,
        notes: 'Primeiro período de férias do ano'
      }
    ];
  }

  // --- Estado Global da Aplicação ---
  const state = {
    config: { ...DEFAULT_CONFIG },
    entries: [],
    vacations: [],
    currentDay: {
      date: getTodayString(),
      startTime: null,
      lunchStart: '12:00',
      lunchEnd: '13:00',
      endTime: null
    },
    userLocation: null,
    isInsideWorkplace: false,
    distanceToWork: null,
    activeTab: 'ponto',
    editingEntryId: null,
    map: null,
    workMarker: null,
    workCircle: null,
    userMarker: null,
    simulationActive: false
  };

  // --- Helpers de Data e Hora ---
  function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getCurrentTimeString() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h * 60) + (m || 0);
  }

  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatCurrency(val) {
    return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDateBR(dateStr) {
    if (!dateStr) return '--/--/----';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // --- Motor de Cálculo de Horas (Normais vs Extras) ---
  /**
   * Calcula as horas de uma jornada de trabalho:
   * - Horário Normal padrão: 08:00 às 17:00 (com 1h de almoço)
   * - Qualquer trabalho antes das 08:00 ou após as 17:00 conta como HORA EXTRA.
   */
  function calculateShift(startTime, endTime, lunchStart = '12:00', lunchEnd = '13:00', rate = null, overtimePct = null) {
    const hourlyRate = Number(rate || state.config.hourlyRate);
    const otPct = Number(overtimePct !== null ? overtimePct : state.config.overtimePercentage);
    const extraRate = hourlyRate * (1 + (otPct / 100));

    if (!startTime || !endTime) {
      return {
        normalMinutes: 0,
        normalHours: 0,
        morningExtraMinutes: 0,
        eveningExtraMinutes: 0,
        totalExtraMinutes: 0,
        totalExtraHours: 0,
        totalWorkedHours: 0,
        normalValue: 0,
        extraValue: 0,
        totalValue: 0
      };
    }

    const tStart = timeToMinutes(startTime);
    const tEnd = timeToMinutes(endTime);
    if (tEnd <= tStart) {
      return {
        normalMinutes: 0, normalHours: 0, morningExtraMinutes: 0,
        eveningExtraMinutes: 0, totalExtraMinutes: 0, totalExtraHours: 0,
        totalWorkedHours: 0, normalValue: 0, extraValue: 0, totalValue: 0
      };
    }

    const lStart = timeToMinutes(lunchStart || '12:00');
    const lEnd = timeToMinutes(lunchEnd || '13:00');

    const stdStart = timeToMinutes(state.config.standardStartTime || '08:00'); // 480
    const stdEnd = timeToMinutes(state.config.standardEndTime || '17:00');     // 1020

    // 1. Horas Extras da Manhã (antes das 08:00)
    let morningExtraMinutes = 0;
    if (tStart < stdStart) {
      morningExtraMinutes = Math.min(stdStart, tEnd) - tStart;
    }

    // 2. Horas Extras da Tarde/Noite (após as 17:00)
    let eveningExtraMinutes = 0;
    if (tEnd > stdEnd) {
      eveningExtraMinutes = tEnd - Math.max(stdEnd, tStart);
    }

    const totalExtraMinutes = morningExtraMinutes + eveningExtraMinutes;
    const totalExtraHours = Number((totalExtraMinutes / 60).toFixed(2));

    // 3. Horas Normais (janela entre 08:00 e 17:00)
    let normalMinutes = 0;
    const winStart = Math.max(tStart, stdStart);
    const winEnd = Math.min(tEnd, stdEnd);

    if (winEnd > winStart) {
      const grossNormal = winEnd - winStart;
      // Abater intervalo de almoço que ocorreu dentro dessa janela
      const lunchOverlap = Math.max(0, Math.min(winEnd, lEnd) - Math.max(winStart, lStart));
      normalMinutes = Math.max(0, grossNormal - lunchOverlap);
    }

    const normalHours = Number((normalMinutes / 60).toFixed(2));
    const totalWorkedHours = Number(((normalMinutes + totalExtraMinutes) / 60).toFixed(2));

    const normalValue = normalHours * hourlyRate;
    const extraValue = totalExtraHours * extraRate;
    const totalValue = normalValue + extraValue;

    return {
      normalMinutes,
      normalHours,
      morningExtraMinutes,
      eveningExtraMinutes,
      totalExtraMinutes,
      totalExtraHours,
      totalWorkedHours,
      normalValue,
      extraValue,
      totalValue,
      hourlyRate,
      extraRate
    };
  }

  // --- Motor de Cálculo de Férias Remuneradas CLT ---
  function calculateVacation(baseSalary, days, sellAbono = false) {
    const salary = Number(baseSalary || state.config.monthlySalary);
    const d = Number(days || 30);

    const dailyRate = salary / 30;
    const periodBase = dailyRate * d;
    const oneThird = periodBase / 3;
    let abonoValue = 0;

    if (sellAbono) {
      // 10 dias de abono pecuniário + 1/3 do abono
      const abonoBase = dailyRate * 10;
      abonoValue = abonoBase + (abonoBase / 3);
    }

    const totalValue = periodBase + oneThird + abonoValue;

    return {
      dailyRate,
      periodBase,
      oneThird,
      abonoValue,
      totalValue
    };
  }

  // --- Fórmula de Haversine para Distância GPS ---
  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Raio da Terra em metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // --- Síntese de Áudio para Feedback de Ponto ---
  let audioCtx = null;
  function playBeep(success = true) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      if (success) {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        osc.frequency.setValueAtTime(300, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {
      // Audio optional
    }
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg flex items-center gap-2.5 px-4 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl shadow-2xl border border-slate-700 dark:border-slate-200 text-xs font-semibold';
    
    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'alert') iconName = 'bell';

    toast.innerHTML = `
      <i data-lucide="${iconName}" class="w-4 h-4 text-brand-400 dark:text-brand-600 shrink-0"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --- Persistência no LocalStorage ---
  function loadFromStorage() {
    try {
      const cfg = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (cfg) state.config = { ...DEFAULT_CONFIG, ...JSON.parse(cfg) };

      const ent = localStorage.getItem(STORAGE_KEYS.ENTRIES);
      state.entries = ent ? JSON.parse(ent) : getSampleData();

      const vac = localStorage.getItem(STORAGE_KEYS.VACATIONS);
      state.vacations = vac ? JSON.parse(vac) : getSampleVacations();

      const cur = localStorage.getItem(STORAGE_KEYS.CURRENT_DAY);
      if (cur) {
        const parsedCur = JSON.parse(cur);
        if (parsedCur.date === getTodayString()) {
          state.currentDay = parsedCur;
        }
      }

      const theme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {
      console.error('Erro ao ler armazenamento local:', e);
      state.entries = getSampleData();
      state.vacations = getSampleVacations();
    }
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.config));
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(state.entries));
  }

  function saveVacations() {
    localStorage.setItem(STORAGE_KEYS.VACATIONS, JSON.stringify(state.vacations));
  }

  function saveCurrentDay() {
    localStorage.setItem(STORAGE_KEYS.CURRENT_DAY, JSON.stringify(state.currentDay));
  }

  // --- Inicialização do Mapa Leaflet ---
  function initMap() {
    const mapContainer = document.getElementById('workplace-map');
    if (!mapContainer || typeof L === 'undefined') return;

    const workLat = state.config.workLocation.lat;
    const workLng = state.config.workLocation.lng;
    const workRadius = state.config.workLocation.radius;

    state.map = L.map('workplace-map').setView([workLat, workLng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(state.map);

    // Ícone personalizado para o local de trabalho
    const workIcon = L.divIcon({
      className: 'custom-work-marker',
      html: `
        <div style="background-color: #1a5ee9; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(26,94,233,0.4); border: 2px solid white;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34]
    });

    state.workMarker = L.marker([workLat, workLng], {
      icon: workIcon,
      draggable: true
    }).addTo(state.map);

    state.workMarker.bindPopup('<b>Local de Trabalho</b><br>Arraste para reposicionar ou clique no mapa.').openPopup();

    // Círculo de Geofence
    state.workCircle = L.circle([workLat, workLng], {
      color: '#1a5ee9',
      fillColor: '#2f7df6',
      fillOpacity: 0.15,
      radius: workRadius
    }).addTo(state.map);

    // Evento de arrastar marcador de trabalho
    state.workMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      updateWorkplaceCoordinates(pos.lat, pos.lng);
      showToast('Local de trabalho reposicionado');
    });

    // Evento de clique no mapa para mover trabalho
    state.map.on('click', function (e) {
      updateWorkplaceCoordinates(e.latlng.lat, e.latlng.lng);
      showToast('Novo local de trabalho definido');
    });
  }

  function updateWorkplaceCoordinates(lat, lng) {
    state.config.workLocation.lat = Number(lat.toFixed(6));
    state.config.workLocation.lng = Number(lng.toFixed(6));
    saveConfig();

    if (state.workMarker) state.workMarker.setLatLng([lat, lng]);
    if (state.workCircle) state.workCircle.setLatLng([lat, lng]);

    // Atualizar campos nas configurações se visíveis
    const latInp = document.getElementById('cfg-work-lat');
    const lngInp = document.getElementById('cfg-work-lng');
    if (latInp) latInp.value = state.config.workLocation.lat;
    if (lngInp) lngInp.value = state.config.workLocation.lng;

    updateGPSStatus();
  }

  // --- Rastreamento e Simulação de GPS ---
  function startGPSTracking() {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          if (!state.simulationActive) {
            handleNewGPSPosition(position.coords.latitude, position.coords.longitude);
          }
        },
        (error) => {
          console.warn('GPS não autorizado ou indisponível:', error.message);
          // Fallback gracioso
          updateGPSUIWithoutCoords();
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } else {
      updateGPSUIWithoutCoords();
    }
  }

  function handleNewGPSPosition(lat, lng) {
    state.userLocation = { lat, lng };

    const distance = calculateDistanceMeters(
      lat, lng,
      state.config.workLocation.lat,
      state.config.workLocation.lng
    );

    state.distanceToWork = distance;
    const wasInside = state.isInsideWorkplace;
    const isNowInside = distance <= state.config.workLocation.radius;
    state.isInsideWorkplace = isNowInside;

    // Atualizar marcador do usuário no mapa
    if (state.map) {
      if (!state.userMarker) {
        const userIcon = L.divIcon({
          className: 'custom-user-marker',
          html: `
            <div style="background-color: #10b981; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 14px rgba(16,185,129,0.7); border: 2px solid white;">
              <span style="width: 10px; height: 10px; background: white; border-radius: 50%;"></span>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        state.userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(state.map);
        state.userMarker.bindPopup('Sua Posição Atual');
      } else {
        state.userMarker.setLatLng([lat, lng]);
      }
    }

    updateGPSStatus();

    // Se acabou de chegar no trabalho e ainda não bateu entrada hoje:
    if (isNowInside && !wasInside && !state.currentDay.startTime) {
      triggerArrivalPrompt();
    }
  }

  function updateGPSUIWithoutCoords() {
    const sidebarInd = document.getElementById('sidebar-gps-indicator');
    const sidebarDist = document.getElementById('sidebar-gps-distance');
    const badge = document.getElementById('ponto-geofence-badge');
    const insideStatus = document.getElementById('gps-inside-status');
    const distSpan = document.getElementById('gps-current-distance');

    if (sidebarInd) {
      sidebarInd.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>Simulador Ativo</span>';
    }
    if (sidebarDist) {
      sidebarDist.innerHTML = `Distância: <strong>Use o Simulador</strong>`;
    }
    if (badge) {
      badge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
      badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>Aguardando Posição</span>';
    }
    if (insideStatus) insideStatus.textContent = 'Aguardando simulação';
    if (distSpan) distSpan.textContent = '--';
  }

  function updateGPSStatus() {
    const isInside = state.isInsideWorkplace;
    const dist = state.distanceToWork !== null ? state.distanceToWork : '--';

    // 1. Sidebar widget
    const sidebarInd = document.getElementById('sidebar-gps-indicator');
    const sidebarDist = document.getElementById('sidebar-gps-distance');
    if (sidebarInd) {
      if (isInside) {
        sidebarInd.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span class="text-emerald-600 font-bold">No Trabalho</span>';
      } else {
        sidebarInd.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500"></span><span class="text-amber-500 font-medium">Fora do Raio</span>';
      }
    }
    if (sidebarDist) {
      sidebarDist.innerHTML = `Distância: <strong>${dist} m</strong> (Raio: ${state.config.workLocation.radius}m)`;
    }

    // 2. Card Status Box
    const targetName = document.getElementById('gps-target-name');
    const currentDist = document.getElementById('gps-current-distance');
    const insideStatus = document.getElementById('gps-inside-status');
    const cardRadius = document.getElementById('card-radius-display');

    if (targetName) targetName.textContent = state.config.workLocation.name || 'Sede da Empresa';
    if (currentDist) currentDist.textContent = `${dist} metros`;
    if (cardRadius) cardRadius.textContent = `${state.config.workLocation.radius}m`;

    if (insideStatus) {
      if (isInside) {
        insideStatus.textContent = 'SIM (🟢 No Local)';
        insideStatus.className = 'font-bold text-emerald-600 dark:text-emerald-400';
      } else {
        insideStatus.textContent = 'NÃO (📍 Fora do Raio)';
        insideStatus.className = 'font-bold text-slate-500';
      }
    }

    // 3. Ponto Geofence Badge
    const badge = document.getElementById('ponto-geofence-badge');
    if (badge) {
      if (isInside) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span><span>No Local de Trabalho (GPS OK)</span>';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>Fora do Trabalho (' + dist + 'm)</span>';
      }
    }
  }

  // --- Sugestão Automática de Horário de Início ao Chegar ---
  function triggerArrivalPrompt() {
    const banner = document.getElementById('arrival-alert-banner');
    const textEl = document.getElementById('arrival-suggestion-text');
    if (!banner || !textEl) return;

    const currentTime = getCurrentTimeString();
    const currentMins = timeToMinutes(currentTime);
    const stdStartMins = timeToMinutes(state.config.standardStartTime || '08:00'); // 480

    let extraMsg = '';
    if (currentMins < stdStartMins) {
      const diffMins = stdStartMins - currentMins;
      const hours = (diffMins / 60).toFixed(2);
      extraMsg = ` (com ${diffMins} minutos / ${hours}h de hora extra matutina contabilizada automaticamente).`;
    } else {
      extraMsg = ` (jornada normal em andamento).`;
    }

    textEl.innerHTML = `Detectamos sua chegada ao local! Horário de início mais provável: <strong>${currentTime}</strong>${extraMsg}`;
    banner.classList.remove('hidden');

    playBeep(true);
  }

  // --- Ações do Dia Atual (Bater Ponto) ---
  function clockIn(customTime = null) {
    const time = customTime || getCurrentTimeString();
    state.currentDay.startTime = time;
    saveCurrentDay();
    updateTodayUI();
    playBeep(true);

    // Ocultar banner de chegada
    const banner = document.getElementById('arrival-alert-banner');
    if (banner) banner.classList.add('hidden');

    const stdStart = state.config.standardStartTime || '08:00';
    if (time < stdStart) {
      showToast(`Entrada registrada às ${time}! Horas antes das ${stdStart} contam como hora extra. 🔥`, 'success');
    } else {
      showToast(`Entrada registrada com sucesso às ${time}!`, 'success');
    }
  }

  function clockOut(customTime = null) {
    if (!state.currentDay.startTime) {
      showToast('Por favor, registre a entrada primeiro!', 'alert');
      return;
    }

    const time = customTime || getCurrentTimeString();
    state.currentDay.endTime = time;
    saveCurrentDay();
    updateTodayUI();
    playBeep(true);

    if (typeof confetti === 'function') {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    }

    // Salvar no histórico permanente automaticamente
    finalizeCurrentDayEntry();
    showToast(`Saída registrada às ${time}! Jornada de hoje calculada e salva. 🚀`, 'success');
  }

  function finalizeCurrentDayEntry() {
    const cur = state.currentDay;
    if (!cur.startTime || !cur.endTime) return;

    // Verificar se já existe registro na mesma data
    const existingIdx = state.entries.findIndex(e => e.date === cur.date);
    const newEntry = {
      id: existingIdx >= 0 ? state.entries[existingIdx].id : 'entry-' + Date.now(),
      date: cur.date,
      startTime: cur.startTime,
      endTime: cur.endTime,
      lunchStart: cur.lunchStart || '12:00',
      lunchEnd: cur.lunchEnd || '13:00',
      hourlyRate: state.config.hourlyRate,
      notes: 'Ponto registrado via GPS'
    };

    if (existingIdx >= 0) {
      state.entries[existingIdx] = newEntry;
    } else {
      state.entries.unshift(newEntry);
    }

    saveEntries();
    renderHistoryTable();
    renderReports();
    updateHeaderEarnings();
  }

  // --- Atualização da UI do Dia Atual ---
  function updateTodayUI() {
    const cur = state.currentDay;
    const entryEl = document.getElementById('today-entry-time');
    const entryTag = document.getElementById('today-entry-tag');
    const exitEl = document.getElementById('today-exit-time');
    const exitTag = document.getElementById('today-exit-tag');
    const lunchStartEl = document.getElementById('today-lunch-start-time');
    const lunchEndEl = document.getElementById('today-lunch-end-time');

    if (entryEl) entryEl.textContent = cur.startTime || '--:--';
    if (exitEl) exitEl.textContent = cur.endTime || '--:--';
    if (lunchStartEl) lunchStartEl.textContent = cur.lunchStart || '12:00';
    if (lunchEndEl) lunchEndEl.textContent = cur.lunchEnd || '13:00';

    if (entryTag) {
      if (cur.startTime) {
        const isEarly = cur.startTime < (state.config.standardStartTime || '08:00');
        entryTag.textContent = isEarly ? 'Hora Extra (Antes 8h)' : 'Horário Normal';
        entryTag.className = isEarly ? 'inline-block mt-1 text-[10px] font-bold text-amber-500' : 'inline-block mt-1 text-[10px] font-semibold text-emerald-500';
      } else {
        entryTag.textContent = 'Não registrada';
        entryTag.className = 'inline-block mt-1 text-[10px] font-semibold text-slate-400';
      }
    }

    if (exitTag) {
      if (cur.endTime) {
        const isLate = cur.endTime > (state.config.standardEndTime || '17:00');
        exitTag.textContent = isLate ? 'Hora Extra (Após 17h)' : 'Jornada Concluída';
        exitTag.className = isLate ? 'inline-block mt-1 text-[10px] font-bold text-amber-500' : 'inline-block mt-1 text-[10px] font-semibold text-emerald-500';
      } else {
        exitTag.textContent = cur.startTime ? 'Em andamento...' : 'Aguardando início';
        exitTag.className = 'inline-block mt-1 text-[10px] font-semibold text-slate-400';
      }
    }

    // Calcular valores de hoje em tempo real
    const calc = calculateShift(
      cur.startTime,
      cur.endTime || (cur.startTime ? getCurrentTimeString() : null),
      cur.lunchStart,
      cur.lunchEnd
    );

    document.getElementById('today-calc-normal').textContent = `${calc.normalHours}h (${formatCurrency(calc.normalValue)})`;
    document.getElementById('today-calc-extra-morning').textContent = `${(calc.morningExtraMinutes / 60).toFixed(2)}h`;
    document.getElementById('today-calc-extra-evening').textContent = `${(calc.eveningExtraMinutes / 60).toFixed(2)}h`;
    document.getElementById('today-calc-total-val').textContent = formatCurrency(calc.totalValue);
  }

  // --- Relógio em Tempo Real ---
  function updateLiveClock() {
    const clockEl = document.getElementById('live-clock');
    const dateEl = document.getElementById('live-date');
    if (!clockEl || !dateEl) return;

    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('pt-BR');

    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    dateEl.textContent = now.toLocaleDateString('pt-BR', options);

    // Se estiver em expediente, atualizar cálculo dinamicamente
    if (state.currentDay.startTime && !state.currentDay.endTime) {
      updateTodayUI();
    }
  }

  // --- Aba 2: Histórico de Horas ---
  function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const emptyState = document.getElementById('history-empty-state');
    const monthFilter = document.getElementById('history-month-filter');
    const filterTotHours = document.getElementById('history-filter-total-hours');
    const filterTotVal = document.getElementById('history-filter-total-value');
    const tabCount = document.getElementById('tab-count-historico');

    if (!tbody) return;

    let filtered = [...state.entries];
    const selectedMonth = monthFilter ? monthFilter.value : '';

    if (selectedMonth) {
      filtered = filtered.filter(e => e.date && e.date.startsWith(selectedMonth));
    }

    // Ordenar por data decrescente
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    if (tabCount) tabCount.textContent = state.entries.length;

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (filterTotHours) filterTotHours.textContent = '0.0h';
      if (filterTotVal) filterTotVal.textContent = 'R$ 0,00';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    tbody.innerHTML = '';

    let sumHours = 0;
    let sumValue = 0;

    filtered.forEach(entry => {
      const calc = calculateShift(
        entry.startTime,
        entry.endTime,
        entry.lunchStart,
        entry.lunchEnd,
        entry.hourlyRate
      );

      sumHours += calc.totalWorkedHours;
      sumValue += calc.totalValue;

      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors';

      // Badges de extra
      let extraBadge = `<span class="text-slate-400 font-mono">0.0h</span>`;
      if (calc.totalExtraHours > 0) {
        extraBadge = `
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-mono font-bold text-[11px]">
            <i data-lucide="flame" class="w-3 h-3 text-amber-500"></i>
            <span>+${calc.totalExtraHours}h (${formatCurrency(calc.extraValue)})</span>
          </span>
        `;
      }

      row.innerHTML = `
        <td class="py-3 px-4 font-medium text-slate-900 dark:text-white font-mono">
          ${formatDateBR(entry.date)}
        </td>
        <td class="py-3 px-3 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
          ${entry.startTime}
        </td>
        <td class="py-3 px-3 font-mono text-slate-500">
          ${entry.lunchStart || '12:00'} - ${entry.lunchEnd || '13:00'}
        </td>
        <td class="py-3 px-3 font-mono font-semibold text-rose-500">
          ${entry.endTime}
        </td>
        <td class="py-3 px-3 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
          ${calc.normalHours}h
        </td>
        <td class="py-3 px-3 text-center">
          ${extraBadge}
        </td>
        <td class="py-3 px-3 font-mono text-slate-500">
          ${formatCurrency(entry.hourlyRate || state.config.hourlyRate)}
        </td>
        <td class="py-3 px-4 text-right font-mono font-extrabold text-brand-600 dark:text-brand-400 text-sm">
          ${formatCurrency(calc.totalValue)}
        </td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1">
            <button class="edit-entry-btn p-1.5 rounded-lg text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800" data-id="${entry.id}" title="Editar">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button class="delete-entry-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" data-id="${entry.id}" title="Excluir">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(row);
    });

    if (filterTotHours) filterTotHours.textContent = `${sumHours.toFixed(1)}h`;
    if (filterTotVal) filterTotVal.textContent = formatCurrency(sumValue);

    if (window.lucide) lucide.createIcons();
  }

  // --- Aba 3: Férias Remuneradas ---
  function renderVacations() {
    const list = document.getElementById('ferias-list-container');
    const emptyState = document.getElementById('ferias-empty-state');
    const totalAcumEl = document.getElementById('ferias-historico-total');

    if (!list) return;

    let totalVacVal = 0;
    list.innerHTML = '';

    if (state.vacations.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (totalAcumEl) totalAcumEl.textContent = 'R$ 0,00';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    state.vacations.forEach(vac => {
      totalVacVal += vac.totalValue;

      const card = document.createElement('div');
      card.className = 'p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900 dark:text-white">${vac.days} Dias de Férias</span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              + 1/3 Constitucional
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Início: <strong>${formatDateBR(vac.startDate)}</strong> | Salário Base: ${formatCurrency(vac.baseSalary)}
            ${vac.notes ? ` — <em>${vac.notes}</em>` : ''}
          </p>
        </div>

        <div class="flex items-center gap-4 self-end sm:self-auto">
          <div class="text-right">
            <span class="text-[10px] uppercase font-bold text-slate-400">Total Proventos</span>
            <div class="font-mono font-extrabold text-base text-emerald-600 dark:text-emerald-400">
              ${formatCurrency(vac.totalValue)}
            </div>
          </div>
          <button class="delete-vacation-btn p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" data-id="${vac.id}" title="Excluir">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      `;

      list.appendChild(card);
    });

    if (totalAcumEl) totalAcumEl.textContent = formatCurrency(totalVacVal);
    if (window.lucide) lucide.createIcons();
  }

  function updateVacationCalcPreview() {
    const salary = Number(document.getElementById('ferias-salario-input').value) || state.config.monthlySalary;
    const days = Number(document.getElementById('ferias-dias-input').value) || 30;
    const abono = document.getElementById('ferias-abono-select').value === 'sim';

    const calc = calculateVacation(salary, days, abono);

    document.getElementById('calc-ferias-base').textContent = formatCurrency(calc.periodBase);
    document.getElementById('calc-ferias-terco').textContent = `+ ${formatCurrency(calc.oneThird)}`;
    document.getElementById('calc-ferias-total').textContent = formatCurrency(calc.totalValue);
  }

  // --- Aba 4: Relatórios e Holerite Estimado ---
  function renderReports() {
    const monthSelect = document.getElementById('report-month-select');
    if (!monthSelect) return;

    const selectedMonth = monthSelect.value || getTodayString().substring(0, 7);
    monthSelect.value = selectedMonth;

    const [year, month] = selectedMonth.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, 1);
    const monthName = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const refLabel = document.getElementById('holerite-ref-month');
    if (refLabel) refLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Filtrar lançamentos do mês
    const monthEntries = state.entries.filter(e => e.date && e.date.startsWith(selectedMonth));

    let totNormalHours = 0;
    let totNormalVal = 0;
    let totExtraHours = 0;
    let totExtraVal = 0;

    monthEntries.forEach(entry => {
      const calc = calculateShift(
        entry.startTime,
        entry.endTime,
        entry.lunchStart,
        entry.lunchEnd,
        entry.hourlyRate
      );
      totNormalHours += calc.normalHours;
      totNormalVal += calc.normalValue;
      totExtraHours += calc.totalExtraHours;
      totExtraVal += calc.extraValue;
    });

    // Férias concedidas no mês
    const monthVacations = state.vacations.filter(v => v.startDate && v.startDate.startsWith(selectedMonth));
    let totVacDays = 0;
    let totVacBase = 0;
    let totVacTerco = 0;
    let totVacVal = 0;

    monthVacations.forEach(v => {
      totVacDays += v.days;
      totVacBase += v.vacationValue || (v.totalValue * 0.75);
      totVacTerco += v.oneThirdBonus || (v.totalValue * 0.25);
      totVacVal += v.totalValue;
    });

    const grandTotal = totNormalVal + totExtraVal + totVacVal;

    // Atualizar cartões de métrica
    document.getElementById('rep-normal-hours').textContent = `${totNormalHours.toFixed(1)}h`;
    document.getElementById('rep-normal-val').textContent = formatCurrency(totNormalVal);

    document.getElementById('rep-extra-hours').textContent = `${totExtraHours.toFixed(1)}h`;
    document.getElementById('rep-extra-val').textContent = formatCurrency(totExtraVal);

    document.getElementById('rep-ferias-days').textContent = `${totVacDays} dias`;
    document.getElementById('rep-ferias-val').textContent = formatCurrency(totVacVal);

    document.getElementById('rep-total-earnings').textContent = formatCurrency(grandTotal);

    // Tabela discriminada estilo Holerite
    document.getElementById('table-row-normal-ref').textContent = `${totNormalHours.toFixed(1)}h`;
    document.getElementById('table-row-normal-unit').textContent = `${formatCurrency(state.config.hourlyRate)}/h`;
    document.getElementById('table-row-normal-tot').textContent = formatCurrency(totNormalVal);

    const extraRate = state.config.hourlyRate * (1 + (state.config.overtimePercentage / 100));
    document.getElementById('table-row-extra-ref').textContent = `${totExtraHours.toFixed(1)}h`;
    document.getElementById('table-row-extra-unit').textContent = `${formatCurrency(extraRate)}/h`;
    document.getElementById('table-row-extra-tot').textContent = formatCurrency(totExtraVal);

    document.getElementById('table-row-ferias-ref').textContent = `${totVacDays} dias`;
    document.getElementById('table-row-ferias-tot').textContent = formatCurrency(totVacBase);

    document.getElementById('table-row-terco-tot').textContent = formatCurrency(totVacTerco);

    document.getElementById('table-row-grand-total').textContent = formatCurrency(grandTotal);
  }

  function updateHeaderEarnings() {
    const curMonth = getTodayString().substring(0, 7);
    const monthEntries = state.entries.filter(e => e.date && e.date.startsWith(curMonth));
    const monthVacations = state.vacations.filter(v => v.startDate && v.startDate.startsWith(curMonth));

    let sum = 0;
    monthEntries.forEach(e => {
      const c = calculateShift(e.startTime, e.endTime, e.lunchStart, e.lunchEnd, e.hourlyRate);
      sum += c.totalValue;
    });
    monthVacations.forEach(v => {
      sum += v.totalValue;
    });

    const el = document.getElementById('header-month-earnings');
    if (el) el.textContent = formatCurrency(sum);

    const rateDisplay = document.getElementById('header-rate-display');
    if (rateDisplay) rateDisplay.textContent = `${formatCurrency(state.config.hourlyRate)}/h`;
  }

  // --- Modal de Lançamento Manual / Edição ---
  function openEntryModal(entryId = null) {
    state.editingEntryId = entryId;
    const modal = document.getElementById('entry-modal');
    const titleEl = document.getElementById('entry-modal-title').querySelector('span');

    const dateInp = document.getElementById('entry-date');
    const startInp = document.getElementById('entry-start-time');
    const endInp = document.getElementById('entry-end-time');
    const lunchStartInp = document.getElementById('entry-lunch-start');
    const lunchEndInp = document.getElementById('entry-lunch-end');
    const rateInp = document.getElementById('entry-rate');

    if (entryId) {
      const entry = state.entries.find(e => e.id === entryId);
      if (!entry) return;

      titleEl.textContent = 'Editar Registro de Jornada';
      dateInp.value = entry.date;
      startInp.value = entry.startTime;
      endInp.value = entry.endTime;
      lunchStartInp.value = entry.lunchStart || '12:00';
      lunchEndInp.value = entry.lunchEnd || '13:00';
      rateInp.value = entry.hourlyRate || state.config.hourlyRate;
    } else {
      titleEl.textContent = 'Novo Registro Manual de Jornada';
      dateInp.value = getTodayString();
      startInp.value = '08:00';
      endInp.value = '17:00';
      lunchStartInp.value = '12:00';
      lunchEndInp.value = '13:00';
      rateInp.value = state.config.hourlyRate;
    }

    updateEntryModalPreview();
    modal.classList.remove('hidden');
  }

  function closeEntryModal() {
    const modal = document.getElementById('entry-modal');
    modal.classList.add('hidden');
    state.editingEntryId = null;
  }

  function updateEntryModalPreview() {
    const start = document.getElementById('entry-start-time').value;
    const end = document.getElementById('entry-end-time').value;
    const lStart = document.getElementById('entry-lunch-start').value;
    const lEnd = document.getElementById('entry-lunch-end').value;
    const rate = Number(document.getElementById('entry-rate').value) || state.config.hourlyRate;

    const calc = calculateShift(start, end, lStart, lEnd, rate);

    document.getElementById('modal-preview-normal').textContent = `${calc.normalHours}h (${formatCurrency(calc.normalValue)})`;
    document.getElementById('modal-preview-extra').textContent = `${calc.totalExtraHours}h (${formatCurrency(calc.extraValue)})`;
    document.getElementById('modal-preview-total').textContent = formatCurrency(calc.totalValue);
  }

  // --- Exportação de Dados ---
  function exportCSV() {
    if (state.entries.length === 0) {
      showToast('Nenhum dado para exportar.');
      return;
    }

    let csv = 'Data,Entrada,Almoco_Saida,Almoco_Volta,Saida,Horas_Normais,Horas_Extras,Valor_Total_BRL\n';

    state.entries.forEach(e => {
      const c = calculateShift(e.startTime, e.endTime, e.lunchStart, e.lunchEnd, e.hourlyRate);
      csv += `${e.date},${e.startTime},${e.lunchStart || '12:00'},${e.lunchEnd || '13:00'},${e.endTime},${c.normalHours},${c.totalExtraHours},${c.totalValue.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pontogps-registros-${getTodayString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Planilha CSV exportada com sucesso!');
  }

  function exportBackupJSON() {
    const data = {
      app: 'PontoGPS Pro',
      version: 2,
      exportedAt: new Date().toISOString(),
      config: state.config,
      entries: state.entries,
      vacations: state.vacations
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pontogps-backup-${getTodayString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON exportado com sucesso!');
  }

  // --- Configurações & Sincronização ---
  function loadConfigForm() {
    document.getElementById('cfg-hourly-rate').value = state.config.hourlyRate;
    document.getElementById('cfg-overtime-pct').value = state.config.overtimePercentage;
    document.getElementById('cfg-monthly-salary').value = state.config.monthlySalary;
    document.getElementById('cfg-start-time').value = state.config.standardStartTime || '08:00';
    document.getElementById('cfg-end-time').value = state.config.standardEndTime || '17:00';
    document.getElementById('cfg-lunch-minutes').value = state.config.lunchMinutes || 60;
    document.getElementById('cfg-work-lat').value = state.config.workLocation.lat;
    document.getElementById('cfg-work-lng').value = state.config.workLocation.lng;
    document.getElementById('cfg-work-radius').value = state.config.workLocation.radius;
  }

  // --- Navegação entre Abas ---
  function switchTab(tabId) {
    state.activeTab = tabId;

    // Atualizar botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active-tab');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        btn.classList.remove('active-tab');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    // Ocultar todas as abas
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });

    // Exibir aba selecionada
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove('hidden');

    // Fechar menu mobile se aberto
    closeMobileDrawer();

    // Redimensionar mapa se abrir aba ponto
    if (tabId === 'ponto' && state.map) {
      setTimeout(() => {
        state.map.invalidateSize();
      }, 200);
    }
  }

  function closeMobileDrawer() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('drawer-backdrop');
    if (sidebar) sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }

  function openMobileDrawer() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('drawer-backdrop');
    if (sidebar) sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  }

  // --- Registro de Event Listeners ---
  function setupEventListeners() {
    // 1. Alternador de abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTab(btn.dataset.tab);
      });
    });

    // 2. Mobile Drawer
    document.getElementById('mobile-menu-btn').addEventListener('click', openMobileDrawer);
    document.getElementById('drawer-backdrop').addEventListener('click', closeMobileDrawer);

    // 3. Tema Dark / Light
    const toggleTheme = () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    };
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('mobile-theme-toggle').addEventListener('click', toggleTheme);

    // 4. Bater Ponto Principal (Entrada / Saída)
    document.getElementById('clock-in-btn').addEventListener('click', () => clockIn());
    document.getElementById('clock-out-btn').addEventListener('click', () => clockOut());

    // 5. Banner de Chegada Automática
    document.getElementById('confirm-arrival-btn').addEventListener('click', () => {
      clockIn();
    });
    document.getElementById('dismiss-arrival-btn').addEventListener('click', () => {
      document.getElementById('arrival-alert-banner').classList.add('hidden');
    });

    // 6. Simulador GPS (Chegada e Saída)
    document.getElementById('sim-arrive-btn').addEventListener('click', () => {
      state.simulationActive = true;
      // Posiciona usuário exatamente nas coordenadas do trabalho (distância 0m)
      handleNewGPSPosition(state.config.workLocation.lat, state.config.workLocation.lng);
      showToast('Simulação: Você está DENTRO do local de trabalho! 🏢', 'success');
    });

    document.getElementById('sim-leave-btn').addEventListener('click', () => {
      state.simulationActive = true;
      // Posiciona usuário a 2km de distância
      handleNewGPSPosition(state.config.workLocation.lat + 0.02, state.config.workLocation.lng + 0.02);
      showToast('Simulação: Você saiu do trabalho (fora do raio). 🚗', 'alert');
    });

    document.getElementById('refresh-gps-btn').addEventListener('click', () => {
      state.simulationActive = false;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            handleNewGPSPosition(pos.coords.latitude, pos.coords.longitude);
            showToast('GPS real atualizado com sucesso!');
          },
          err => showToast('GPS indisponível: ' + err.message, 'alert')
        );
      }
    });

    // 7. Mapa Ações
    document.getElementById('center-map-work-btn').addEventListener('click', () => {
      if (state.map) {
        state.map.setView([state.config.workLocation.lat, state.config.workLocation.lng], 16);
      }
    });

    document.getElementById('use-current-location-btn').addEventListener('click', () => {
      if (state.userLocation) {
        updateWorkplaceCoordinates(state.userLocation.lat, state.userLocation.lng);
        showToast('Local de trabalho atualizado para sua posição atual!');
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          updateWorkplaceCoordinates(pos.coords.latitude, pos.coords.longitude);
          showToast('Local de trabalho definido com sucesso!');
        });
      }
    });

    // 8. Ajustar Horários de Hoje
    document.getElementById('edit-today-details-btn').addEventListener('click', () => {
      openEntryModal();
      document.getElementById('entry-date').value = state.currentDay.date;
      if (state.currentDay.startTime) document.getElementById('entry-start-time').value = state.currentDay.startTime;
      if (state.currentDay.endTime) document.getElementById('entry-end-time').value = state.currentDay.endTime;
    });

    // 9. Lançamentos Histórico
    document.getElementById('open-manual-entry-btn').addEventListener('click', () => openEntryModal());
    document.getElementById('history-add-entry-btn').addEventListener('click', () => openEntryModal());
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    document.getElementById('export-backup-btn').addEventListener('click', exportBackupJSON);

    // Filtro de mês no histórico
    const historyMonth = document.getElementById('history-month-filter');
    if (historyMonth) {
      historyMonth.value = getTodayString().substring(0, 7);
      historyMonth.addEventListener('change', renderHistoryTable);
    }

    // Ações de linha na tabela (Editar / Excluir)
    document.getElementById('history-table-body').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-entry-btn');
      if (editBtn) {
        openEntryModal(editBtn.dataset.id);
        return;
      }

      const delBtn = e.target.closest('.delete-entry-btn');
      if (delBtn) {
        if (confirm('Deseja realmente excluir este registro de jornada?')) {
          state.entries = state.entries.filter(en => en.id !== delBtn.dataset.id);
          saveEntries();
          renderHistoryTable();
          renderReports();
          updateHeaderEarnings();
          showToast('Registro excluído');
        }
      }
    });

    // 10. Modal Form de Lançamento
    document.getElementById('close-entry-modal-btn').addEventListener('click', closeEntryModal);
    document.getElementById('entry-modal-cancel').addEventListener('click', closeEntryModal);

    ['entry-start-time', 'entry-end-time', 'entry-lunch-start', 'entry-lunch-end', 'entry-rate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateEntryModalPreview);
    });

    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('entry-date').value;
      const startTime = document.getElementById('entry-start-time').value;
      const endTime = document.getElementById('entry-end-time').value;
      const lunchStart = document.getElementById('entry-lunch-start').value;
      const lunchEnd = document.getElementById('entry-lunch-end').value;
      const rate = Number(document.getElementById('entry-rate').value) || state.config.hourlyRate;

      if (!date || !startTime || !endTime) return;

      if (state.editingEntryId) {
        const idx = state.entries.findIndex(en => en.id === state.editingEntryId);
        if (idx >= 0) {
          state.entries[idx] = {
            ...state.entries[idx],
            date,
            startTime,
            endTime,
            lunchStart,
            lunchEnd,
            hourlyRate: rate
          };
          showToast('Registro atualizado com sucesso!');
        }
      } else {
        const newEntry = {
          id: 'entry-' + Date.now(),
          date,
          startTime,
          endTime,
          lunchStart,
          lunchEnd,
          hourlyRate: rate,
          notes: 'Lançamento manual'
        };
        state.entries.unshift(newEntry);
        showToast('Registro adicionado com sucesso!');
      }

      // Se for a data de hoje, sincroniza o cartão principal
      if (date === state.currentDay.date) {
        state.currentDay.startTime = startTime;
        state.currentDay.endTime = endTime;
        state.currentDay.lunchStart = lunchStart;
        state.currentDay.lunchEnd = lunchEnd;
        saveCurrentDay();
        updateTodayUI();
      }

      saveEntries();
      closeEntryModal();
      renderHistoryTable();
      renderReports();
      updateHeaderEarnings();
    });

    // 11. Calculadora de Férias
    ['ferias-salario-input', 'ferias-dias-input', 'ferias-abono-select'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateVacationCalcPreview);
    });

    document.getElementById('ferias-calc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const salary = Number(document.getElementById('ferias-salario-input').value) || state.config.monthlySalary;
      const startDate = document.getElementById('ferias-data-inicio').value || getTodayString();
      const days = Number(document.getElementById('ferias-dias-input').value) || 30;
      const abono = document.getElementById('ferias-abono-select').value === 'sim';

      const calc = calculateVacation(salary, days, abono);

      const newVac = {
        id: 'vac-' + Date.now(),
        startDate,
        days,
        baseSalary: salary,
        vacationValue: calc.periodBase,
        oneThirdBonus: calc.oneThird,
        totalValue: calc.totalValue,
        soldAbono: abono,
        notes: abono ? 'Férias com abono pecuniário' : 'Férias regulares'
      };

      state.vacations.unshift(newVac);
      saveVacations();
      renderVacations();
      renderReports();
      updateHeaderEarnings();
      showToast('Período de férias cadastrado com sucesso!', 'success');
    });

    // Excluir Férias
    document.getElementById('ferias-list-container').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.delete-vacation-btn');
      if (delBtn) {
        if (confirm('Deseja excluir este período de férias?')) {
          state.vacations = state.vacations.filter(v => v.id !== delBtn.dataset.id);
          saveVacations();
          renderVacations();
          renderReports();
          updateHeaderEarnings();
          showToast('Férias excluídas');
        }
      }
    });

    // 12. Relatório Mês e Impressão
    const reportMonth = document.getElementById('report-month-select');
    if (reportMonth) {
      reportMonth.addEventListener('change', renderReports);
    }
    document.getElementById('print-report-btn').addEventListener('click', () => {
      window.print();
    });

    // 13. Formulário de Configurações
    document.getElementById('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state.config.hourlyRate = Number(document.getElementById('cfg-hourly-rate').value);
      state.config.overtimePercentage = Number(document.getElementById('cfg-overtime-pct').value);
      state.config.monthlySalary = Number(document.getElementById('cfg-monthly-salary').value);
      state.config.standardStartTime = document.getElementById('cfg-start-time').value;
      state.config.standardEndTime = document.getElementById('cfg-end-time').value;
      state.config.lunchMinutes = Number(document.getElementById('cfg-lunch-minutes').value);
      state.config.workLocation.lat = Number(document.getElementById('cfg-work-lat').value);
      state.config.workLocation.lng = Number(document.getElementById('cfg-work-lng').value);
      state.config.workLocation.radius = Number(document.getElementById('cfg-work-radius').value);

      saveConfig();
      if (state.workCircle) state.workCircle.setRadius(state.config.workLocation.radius);
      updateGPSStatus();
      updateTodayUI();
      renderHistoryTable();
      renderReports();
      updateHeaderEarnings();
      showToast('Configurações salvas com sucesso!', 'success');
    });

    document.getElementById('cfg-get-gps-btn').addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          document.getElementById('cfg-work-lat').value = pos.coords.latitude.toFixed(6);
          document.getElementById('cfg-work-lng').value = pos.coords.longitude.toFixed(6);
          showToast('Coordenadas atuais inseridas no formulário!');
        });
      }
    });

    document.getElementById('cfg-reset-defaults-btn').addEventListener('click', () => {
      if (confirm('Deseja restaurar todas as configurações para o padrão?')) {
        state.config = { ...DEFAULT_CONFIG };
        saveConfig();
        loadConfigForm();
        showToast('Configurações restauradas.');
      }
    });
  }

  // --- Inicialização ---
  function init() {
    loadFromStorage();
    loadConfigForm();
    initMap();
    startGPSTracking();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    updateTodayUI();
    renderHistoryTable();
    renderVacations();
    updateVacationCalcPreview();
    renderReports();
    updateHeaderEarnings();
    setupEventListeners();

    // Data inicial no form de férias
    const feriasDate = document.getElementById('ferias-data-inicio');
    if (feriasDate) feriasDate.value = getTodayString();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
