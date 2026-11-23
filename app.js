/**
 * PontoGPS Pro — Controle de Ponto, Horas Extras e Férias (Moeda: Ienes JPY ¥)
 * Funcionalidades:
 * - Moeda: Ienes (¥)
 * - Período de cálculo customizável (Data de Início e Fim do Mês / Shimebi)
 * - Férias remuneradas calculadas como % da hora normal (8h normais por dia),
 *   sem somar nas horas físicas trabalhadas e creditadas direto no salário final a receber.
 * - Geofencing GPS com radar e cálculo de horas extras antes das 8h e após 17h.
 */

(function () {
  'use strict';

  // --- Chaves do LocalStorage ---
  const STORAGE_KEYS = {
    ENTRIES: 'pontogps_entries_v2',
    VACATIONS: 'pontogps_vacations_v2',
    CONFIG: 'pontogps_config_v2',
    CURRENT_DAY: 'pontogps_current_day_v2',
    PERIOD: 'pontogps_period_v2',
    THEME: 'pontogps_theme_v2'
  };

  // --- Configurações Padrão (Em Ienes) ---
  const DEFAULT_CONFIG = {
    hourlyRate: 1500,         // ¥ 1.500 por hora
    overtimePercentage: 25,   // 25% de adicional de hora extra (padrão Japão)
    vacationPercentage: 100,  // 100% da hora normal (8h integrais por dia)
    closingDay: 'last',       // 'last' (mês calendário), '20' (21 ao 20), '25' (26 ao 25)
    standardStartTime: '08:00', // Início da jornada normal
    standardEndTime: '17:00',   // Fim da jornada normal
    lunchMinutes: 60,         // 60 minutos de intervalo
    workLocation: {
      name: 'Fábrica / Escritório',
      lat: 35.681236,          // Tóquio / Estação Central (Exemplo padrão)
      lng: 139.767125,
      radius: 150              // 150 metros de tolerância
    }
  };

  // --- Helpers de Data e Hora ---
  function getTodayString(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  function formatCurrency(val) {
    const rounded = Math.round(val || 0);
    return '¥ ' + rounded.toLocaleString('pt-BR');
  }

  function formatDateBR(dateStr) {
    if (!dateStr) return '--/--/----';
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  // --- Cálculo do Período do Mês (Data Início e Fim) ---
  function calculatePeriodRange(closingDayPreset = 'last', referenceDate = new Date()) {
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth(); // 0 a 11

    if (closingDayPreset === '20') {
      // Período: 21 do mês anterior ao dia 20 deste mês
      const start = new Date(y, m - 1, 21);
      const end = new Date(y, m, 20);
      return {
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end)
      };
    } else if (closingDayPreset === '25') {
      // Período: 26 do mês anterior ao dia 25 deste mês
      const start = new Date(y, m - 1, 26);
      const end = new Date(y, m, 25);
      return {
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end)
      };
    } else if (closingDayPreset === '15') {
      const start = new Date(y, m - 1, 16);
      const end = new Date(y, m, 15);
      return {
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end)
      };
    } else if (closingDayPreset === '10') {
      const start = new Date(y, m - 1, 11);
      const end = new Date(y, m, 10);
      return {
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end)
      };
    } else {
      // Mês Calendário: 1º ao último dia do mês atual
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0); // Último dia do mês
      return {
        startDate: formatIsoDate(start),
        endDate: formatIsoDate(end)
      };
    }
  }

  function formatIsoDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- Dados de Demonstração em Ienes ---
  function getSampleData() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    return [
      {
        id: 'entry-1',
        date: `${year}-${month}-03`,
        isVacation: false,
        startTime: '07:30',
        endTime: '17:30',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 1500,
        notes: 'Chegada antecipada (30m extra matutina) e 30m extra no fechamento'
      },
      {
        id: 'entry-2',
        date: `${year}-${month}-04`,
        isVacation: false,
        startTime: '08:00',
        endTime: '19:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 1500,
        notes: '2 horas extras vespertinas (após 17h)'
      },
      {
        id: 'entry-3',
        date: `${year}-${month}-05`,
        isVacation: true,
        startTime: null,
        endTime: null,
        hourlyRate: 1500,
        vacationPercentage: 100,
        notes: 'Dia de Férias Remuneradas (8h normais creditadas, 0h físicas)'
      },
      {
        id: 'entry-4',
        date: `${year}-${month}-06`,
        isVacation: false,
        startTime: '08:00',
        endTime: '17:00',
        lunchStart: '12:00',
        lunchEnd: '13:00',
        hourlyRate: 1500,
        notes: 'Jornada normal padrão de 8 horas'
      }
    ];
  }

  function getSampleVacations() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return [
      {
        id: 'vac-1',
        startDate: `${year}-${month}-12`,
        days: 1,
        hourlyRate: 1500,
        percentage: 100,
        dailyHours: 8,
        totalValue: 12000,
        notes: 'Descanso remunerado (Yukyu)'
      }
    ];
  }

  // --- Estado Global ---
  const state = {
    config: { ...DEFAULT_CONFIG },
    entries: [],
    vacations: [],
    calculationPeriod: {
      startDate: '',
      endDate: ''
    },
    currentDay: {
      date: getTodayString(),
      startTime: null,
      lunchStart: '12:00',
      lunchEnd: '13:00',
      endTime: null,
      isVacation: false
    },
    userLocation: null,
    isInsideWorkplace: false,
    distanceToWork: null,
    activeTab: 'ponto',
    editingEntryId: null,
    salaryHidden: false,
    map: null,
    workMarker: null,
    workCircle: null,
    userMarker: null,
    simulationActive: false
  };

  // --- Motor de Cálculo de Horas (Normais vs Extras) ---
  /**
   * - 08:00 às 17:00: Horário Normal (8h com 1h de almoço)
   * - Antes das 08:00 ou após as 17:00: Hora Extra
   * - Se for Dia de Férias: 0h trabalhadas fisicamente, 8h normais remuneradas calculadas no valor
   */
  function calculateShift(startTime, endTime, lunchStart = '12:00', lunchEnd = '13:00', rate = null, isVacation = false, vacPct = null) {
    const hourlyRate = Number(rate || state.config.hourlyRate);
    const otPct = Number(state.config.overtimePercentage);
    const extraRate = hourlyRate * (1 + (otPct / 100));

    // Se for dia de férias
    if (isVacation) {
      const percentage = Number(vacPct !== null ? vacPct : state.config.vacationPercentage);
      const vacationDailyValue = 8 * hourlyRate * (percentage / 100);
      return {
        isVacation: true,
        normalHours: 0, // Não soma nas horas físicas trabalhadas!
        totalExtraHours: 0,
        totalWorkedHours: 0, // Zero horas trabalhadas fisicamente!
        vacationHoursEquiv: 8,
        normalValue: 0,
        extraValue: 0,
        vacationValue: vacationDailyValue,
        totalValue: vacationDailyValue,
        hourlyRate,
        extraRate
      };
    }

    if (!startTime || !endTime) {
      return {
        isVacation: false,
        normalMinutes: 0,
        normalHours: 0,
        morningExtraMinutes: 0,
        eveningExtraMinutes: 0,
        totalExtraMinutes: 0,
        totalExtraHours: 0,
        totalWorkedHours: 0,
        normalValue: 0,
        extraValue: 0,
        vacationValue: 0,
        totalValue: 0,
        hourlyRate,
        extraRate
      };
    }

    const tStart = timeToMinutes(startTime);
    const tEnd = timeToMinutes(endTime);
    if (tEnd <= tStart) {
      return {
        isVacation: false,
        normalMinutes: 0, normalHours: 0, morningExtraMinutes: 0,
        eveningExtraMinutes: 0, totalExtraMinutes: 0, totalExtraHours: 0,
        totalWorkedHours: 0, normalValue: 0, extraValue: 0, vacationValue: 0,
        totalValue: 0, hourlyRate, extraRate
      };
    }

    const lStart = timeToMinutes(lunchStart || '12:00');
    const lEnd = timeToMinutes(lunchEnd || '13:00');

    const stdStart = timeToMinutes(state.config.standardStartTime || '08:00'); // 480
    const stdEnd = timeToMinutes(state.config.standardEndTime || '17:00');     // 1020

    // 1. Horas Extras Manhã (antes das 08:00)
    let morningExtraMinutes = 0;
    if (tStart < stdStart) {
      morningExtraMinutes = Math.min(stdStart, tEnd) - tStart;
    }

    // 2. Horas Extras Tarde/Noite (após as 17:00)
    let eveningExtraMinutes = 0;
    if (tEnd > stdEnd) {
      eveningExtraMinutes = tEnd - Math.max(stdEnd, tStart);
    }

    const totalExtraMinutes = morningExtraMinutes + eveningExtraMinutes;
    const totalExtraHours = Number((totalExtraMinutes / 60).toFixed(2));

    // 3. Horas Normais (janela 08:00 às 17:00)
    let normalMinutes = 0;
    const winStart = Math.max(tStart, stdStart);
    const winEnd = Math.min(tEnd, stdEnd);

    if (winEnd > winStart) {
      const grossNormal = winEnd - winStart;
      const lunchOverlap = Math.max(0, Math.min(winEnd, lEnd) - Math.max(winStart, lStart));
      normalMinutes = Math.max(0, grossNormal - lunchOverlap);
    }

    const normalHours = Number((normalMinutes / 60).toFixed(2));
    const totalWorkedHours = Number(((normalMinutes + totalExtraMinutes) / 60).toFixed(2));

    const normalValue = normalHours * hourlyRate;
    const extraValue = totalExtraHours * extraRate;
    const totalValue = normalValue + extraValue;

    return {
      isVacation: false,
      normalMinutes,
      normalHours,
      morningExtraMinutes,
      eveningExtraMinutes,
      totalExtraMinutes,
      totalExtraHours,
      totalWorkedHours,
      normalValue,
      extraValue,
      vacationValue: 0,
      totalValue,
      hourlyRate,
      extraRate
    };
  }

  // --- Motor de Cálculo de Férias Remuneradas (% da Hora Normal) ---
  /**
   * Cada dia de férias = 8h normais * hourlyRate * (porcentagem / 100).
   * Sem somar nas horas trabalhadas físicas!
   */
  function calculateVacation(days, rate = null, pct = null) {
    const d = Number(days || 1);
    const hourlyRate = Number(rate || state.config.hourlyRate);
    const percentage = Number(pct !== null ? pct : state.config.vacationPercentage);

    const dailyValue = 8 * hourlyRate * (percentage / 100);
    const totalValue = d * dailyValue;

    return {
      days: d,
      hoursEquivPerDay: 8,
      totalHoursEquiv: d * 8,
      dailyValue,
      totalValue,
      percentage
    };
  }

  // --- Distância GPS (Haversine) ---
  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  // --- Síntese de Som ---
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
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
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
      // Ignora erro de áudio
    }
  }

  // --- Notificações Toast ---
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

  // --- Persistência LocalStorage ---
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

      const savedPeriod = localStorage.getItem(STORAGE_KEYS.PERIOD);
      if (savedPeriod) {
        state.calculationPeriod = JSON.parse(savedPeriod);
      } else {
        state.calculationPeriod = calculatePeriodRange(state.config.closingDay);
      }

      const theme = localStorage.getItem(STORAGE_KEYS.THEME);
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      const savedSalaryHidden = localStorage.getItem('pontogps_salary_hidden');
      if (savedSalaryHidden !== null) {
        state.salaryHidden = JSON.parse(savedSalaryHidden);
      }
    } catch (e) {
      console.error('Erro ao ler armazenamento local:', e);
      state.entries = getSampleData();
      state.vacations = getSampleVacations();
      state.calculationPeriod = calculatePeriodRange('last');
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

  function savePeriod() {
    localStorage.setItem(STORAGE_KEYS.PERIOD, JSON.stringify(state.calculationPeriod));
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

    state.workMarker.bindPopup('<b>Local de Trabalho (GPS)</b><br>Arraste para reposicionar.').openPopup();

    state.workCircle = L.circle([workLat, workLng], {
      color: '#1a5ee9',
      fillColor: '#2f7df6',
      fillOpacity: 0.15,
      radius: workRadius
    }).addTo(state.map);

    state.workMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      updateWorkplaceCoordinates(pos.lat, pos.lng);
      showToast('Local de trabalho reposicionado');
    });

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

    const latInp = document.getElementById('cfg-work-lat');
    const lngInp = document.getElementById('cfg-work-lng');
    if (latInp) latInp.value = state.config.workLocation.lat;
    if (lngInp) lngInp.value = state.config.workLocation.lng;

    updateGPSStatus();
  }

  // --- Rastreamento GPS ---
  function startGPSTracking() {
    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition(
        (position) => {
          if (!state.simulationActive) {
            handleNewGPSPosition(position.coords.latitude, position.coords.longitude);
          }
        },
        () => {
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

    // Se acabou de chegar no trabalho e ainda não bateu ponto hoje:
    if (isNowInside && !wasInside && !state.currentDay.startTime && !state.currentDay.isVacation) {
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

    const targetName = document.getElementById('gps-target-name');
    const currentDist = document.getElementById('gps-current-distance');
    const insideStatus = document.getElementById('gps-inside-status');
    const cardRadius = document.getElementById('card-radius-display');

    if (targetName) targetName.textContent = state.config.workLocation.name || 'Local de Trabalho';
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

    const badge = document.getElementById('ponto-geofence-badge');
    if (badge) {
      if (isInside) {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span><span>No Trabalho (GPS OK)</span>';
      } else {
        badge.className = 'px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-400"></span><span>Fora do Trabalho (' + dist + 'm)</span>';
      }
    }
  }

  // --- Sugestão Automática de Chegada ---
  function triggerArrivalPrompt() {
    const banner = document.getElementById('arrival-alert-banner');
    const textEl = document.getElementById('arrival-suggestion-text');
    if (!banner || !textEl) return;

    const currentTime = getCurrentTimeString();
    const currentMins = timeToMinutes(currentTime);
    const stdStartMins = timeToMinutes(state.config.standardStartTime || '08:00');

    let extraMsg = '';
    if (currentMins < stdStartMins) {
      const diffMins = stdStartMins - currentMins;
      const hours = (diffMins / 60).toFixed(2);
      extraMsg = ` (${diffMins} min / ${hours}h de hora extra matutina contabilizada automaticamente).`;
    } else {
      extraMsg = ` (jornada normal).`;
    }

    textEl.innerHTML = `Detectamos sua chegada! Horário de início sugerido: <strong>${currentTime}</strong>${extraMsg}`;
    banner.classList.remove('hidden');

    playBeep(true);
  }

  // --- Ações do Dia Atual ---
  function clockIn(customTime = null) {
    const time = customTime || getCurrentTimeString();
    state.currentDay.startTime = time;
    state.currentDay.isVacation = false;
    saveCurrentDay();
    updateTodayUI();
    playBeep(true);

    const banner = document.getElementById('arrival-alert-banner');
    if (banner) banner.classList.add('hidden');

    const stdStart = state.config.standardStartTime || '08:00';
    if (time < stdStart) {
      showToast(`Entrada registrada às ${time}! Antes das ${stdStart} conta como hora extra (¥). 🔥`, 'success');
    } else {
      showToast(`Entrada registrada às ${time}!`, 'success');
    }
  }

  function clockOut(customTime = null) {
    if (!state.currentDay.startTime) {
      showToast('Registre a entrada primeiro!', 'alert');
      return;
    }

    const time = customTime || getCurrentTimeString();
    state.currentDay.endTime = time;
    saveCurrentDay();
    updateTodayUI();
    playBeep(true);

    if (typeof confetti === 'function') {
      confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
    }

    finalizeCurrentDayEntry();
    showToast(`Saída registrada às ${time}! Jornada salva. 🚀`, 'success');
  }

  function finalizeCurrentDayEntry() {
    const cur = state.currentDay;
    if (!cur.startTime || !cur.endTime) return;

    const existingIdx = state.entries.findIndex(e => e.date === cur.date);
    const newEntry = {
      id: existingIdx >= 0 ? state.entries[existingIdx].id : 'entry-' + Date.now(),
      date: cur.date,
      isVacation: false,
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
    renderAllViews();
  }

  // --- UI do Dia Atual ---
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
      if (cur.isVacation) {
        entryTag.textContent = '🏖️ Dia de Férias Remuneradas';
        entryTag.className = 'inline-block mt-1 text-[10px] font-bold text-purple-600';
      } else if (cur.startTime) {
        const isEarly = cur.startTime < (state.config.standardStartTime || '08:00');
        entryTag.textContent = isEarly ? 'Hora Extra (< 8h)' : 'Horário Normal';
        entryTag.className = isEarly ? 'inline-block mt-1 text-[10px] font-bold text-amber-500' : 'inline-block mt-1 text-[10px] font-semibold text-emerald-500';
      } else {
        entryTag.textContent = 'Não registrada';
        entryTag.className = 'inline-block mt-1 text-[10px] font-semibold text-slate-400';
      }
    }

    if (exitTag) {
      if (cur.isVacation) {
        exitTag.textContent = '8h pagas no salário';
        exitTag.className = 'inline-block mt-1 text-[10px] font-bold text-purple-600';
      } else if (cur.endTime) {
        const isLate = cur.endTime > (state.config.standardEndTime || '17:00');
        exitTag.textContent = isLate ? 'Hora Extra (> 17h)' : 'Jornada Concluída';
        exitTag.className = isLate ? 'inline-block mt-1 text-[10px] font-bold text-amber-500' : 'inline-block mt-1 text-[10px] font-semibold text-emerald-500';
      } else {
        exitTag.textContent = cur.startTime ? 'Em andamento...' : 'Aguardando início';
        exitTag.className = 'inline-block mt-1 text-[10px] font-semibold text-slate-400';
      }
    }

    const calc = calculateShift(
      cur.startTime,
      cur.endTime || (cur.startTime ? getCurrentTimeString() : null),
      cur.lunchStart,
      cur.lunchEnd,
      state.config.hourlyRate,
      cur.isVacation
    );

    document.getElementById('today-calc-normal').textContent = `${calc.normalHours}h (${formatCurrency(calc.normalValue)})`;
    document.getElementById('today-calc-extra-morning').textContent = `${((calc.morningExtraMinutes || 0) / 60).toFixed(2)}h`;
    document.getElementById('today-calc-extra-evening').textContent = `${((calc.eveningExtraMinutes || 0) / 60).toFixed(2)}h`;
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

    if (state.currentDay.startTime && !state.currentDay.endTime && !state.currentDay.isVacation) {
      updateTodayUI();
    }
  }

  // --- Filtragem por Período de Apuração (Data Início e Fim) ---
  function getFilteredEntries() {
    const { startDate, endDate } = state.calculationPeriod;
    return state.entries.filter(entry => {
      if (!entry.date) return false;
      if (startDate && entry.date < startDate) return false;
      if (endDate && entry.date > endDate) return false;
      return true;
    });
  }

  function getFilteredVacations() {
    const { startDate, endDate } = state.calculationPeriod;
    return state.vacations.filter(vac => {
      if (!vac.startDate) return false;
      if (startDate && vac.startDate < startDate) return false;
      if (endDate && vac.startDate > endDate) return false;
      return true;
    });
  }

  // --- Aba 2: Histórico de Horas ---
  function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const emptyState = document.getElementById('history-empty-state');
    const filterTotHours = document.getElementById('history-filter-total-hours');
    const filterTotVacDays = document.getElementById('history-filter-vacation-days');
    const filterTotVal = document.getElementById('history-filter-total-value');
    const tabCount = document.getElementById('tab-count-historico');
    const periodDisplay = document.getElementById('history-period-display');

    if (!tbody) return;

    const filtered = getFilteredEntries();
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    if (tabCount) tabCount.textContent = filtered.length;
    if (periodDisplay) {
      periodDisplay.textContent = `${formatDateBR(state.calculationPeriod.startDate)} a ${formatDateBR(state.calculationPeriod.endDate)}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      if (filterTotHours) filterTotHours.textContent = '0.0h';
      if (filterTotVacDays) filterTotVacDays.textContent = '0d';
      if (filterTotVal) filterTotVal.textContent = '¥ 0';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    tbody.innerHTML = '';

    let sumPhysicalHours = 0;
    let sumVacDays = 0;
    let sumValue = 0;

    filtered.forEach(entry => {
      const calc = calculateShift(
        entry.startTime,
        entry.endTime,
        entry.lunchStart,
        entry.lunchEnd,
        entry.hourlyRate,
        entry.isVacation,
        entry.vacationPercentage
      );

      sumPhysicalHours += calc.totalWorkedHours; // Não inclui férias!
      if (entry.isVacation) sumVacDays += 1;
      sumValue += calc.totalValue;

      const row = document.createElement('tr');
      row.className = `hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
        entry.isVacation ? 'bg-purple-50/40 dark:bg-purple-950/20' : ''
      }`;

      if (entry.isVacation) {
        // Linha especial de Férias Remuneradas
        row.innerHTML = `
          <td class="py-3 px-4 font-medium text-slate-900 dark:text-white font-mono">
            ${formatDateBR(entry.date)}
          </td>
          <td class="py-3 px-3">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold text-xs border border-purple-200 dark:border-purple-800">
              <i data-lucide="palmtree" class="w-3.5 h-3.5 text-purple-500"></i>
              <span>Dia de Férias Remuneradas</span>
            </span>
          </td>
          <td class="py-3 px-3 text-slate-400 font-mono">--</td>
          <td class="py-3 px-3 text-center">
            <span class="text-purple-600 dark:text-purple-400 font-mono font-bold" title="Equivalência de 8h no salário (0h físicas trabalhadas)">
              8.0h (Férias)
            </span>
          </td>
          <td class="py-3 px-3 text-center text-slate-400 font-mono">0.0h</td>
          <td class="py-3 px-3 font-mono text-slate-500">
            ${formatCurrency(entry.hourlyRate || state.config.hourlyRate)}
          </td>
          <td class="py-3 px-4 text-right font-mono font-extrabold text-purple-600 dark:text-purple-400 text-sm">
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
      } else {
        // Linha regular de trabalho
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
          <td class="py-3 px-3 font-mono font-semibold text-slate-700 dark:text-slate-200">
            ${entry.startTime} às ${entry.endTime}
          </td>
          <td class="py-3 px-3 font-mono text-slate-500">
            ${entry.lunchStart || '12:00'} - ${entry.lunchEnd || '13:00'}
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
      }

      tbody.appendChild(row);
    });

    if (filterTotHours) filterTotHours.textContent = `${sumPhysicalHours.toFixed(1)}h`;
    if (filterTotVacDays) filterTotVacDays.textContent = `${sumVacDays}d`;
    if (filterTotVal) filterTotVal.textContent = formatCurrency(sumValue);

    if (window.lucide) lucide.createIcons();
  }

  // --- Aba 3: Férias Remuneradas (Yukyu) ---
  function renderVacations() {
    const list = document.getElementById('ferias-list-container');
    const emptyState = document.getElementById('ferias-empty-state');
    const totalAcumEl = document.getElementById('ferias-historico-total');
    const tabCount = document.getElementById('tab-count-ferias');

    if (!list) return;

    // Férias cadastradas como blocos no período
    const filteredVacations = getFilteredVacations();

    // Também contar dias de férias marcados nas entradas normais
    const vacationEntries = getFilteredEntries().filter(e => e.isVacation);

    let totalVacVal = 0;
    let totalDays = 0;
    list.innerHTML = '';

    vacationEntries.forEach(ve => {
      const c = calculateShift(null, null, null, null, ve.hourlyRate, true, ve.vacationPercentage);
      totalVacVal += c.totalValue;
      totalDays += 1;

      const card = document.createElement('div');
      card.className = 'p-4 rounded-2xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900 dark:text-white">1 Dia de Férias Remuneradas</span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
              ${formatDateBR(ve.date)}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Calculado: 8h normais @ ${formatCurrency(ve.hourlyRate || state.config.hourlyRate)} (${ve.vacationPercentage || state.config.vacationPercentage}%)
            — <strong>0h físicas trabalhadas</strong> somadas no mês
          </p>
        </div>

        <div class="text-right self-end sm:self-auto">
          <span class="text-[10px] uppercase font-bold text-slate-400">Pago no Salário</span>
          <div class="font-mono font-extrabold text-base text-purple-600 dark:text-purple-400">
            ${formatCurrency(c.totalValue)}
          </div>
        </div>
      `;
      list.appendChild(card);
    });

    filteredVacations.forEach(vac => {
      totalVacVal += vac.totalValue;
      totalDays += vac.days;

      const card = document.createElement('div');
      card.className = 'p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3';
      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-900 dark:text-white">${vac.days} Dia(s) de Férias Remuneradas</span>
            <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              ${vac.percentage}% da hora normal
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Data: <strong>${formatDateBR(vac.startDate)}</strong> | Base: ${formatCurrency(vac.hourlyRate)}/h
            (8h/dia) — <strong>Sem acréscimo em horas trabalhadas</strong>
            ${vac.notes ? ` — <em>${vac.notes}</em>` : ''}
          </p>
        </div>

        <div class="flex items-center gap-4 self-end sm:self-auto">
          <div class="text-right">
            <span class="text-[10px] uppercase font-bold text-slate-400">Total a Receber</span>
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
    if (tabCount) tabCount.textContent = `${totalDays}d`;

    if (totalDays === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
    }

    if (window.lucide) lucide.createIcons();
  }

  function updateVacationCalcPreview() {
    const rate = Number(document.getElementById('ferias-hourly-rate-input').value) || state.config.hourlyRate;
    const pct = Number(document.getElementById('ferias-pct-input').value) || state.config.vacationPercentage;
    const days = Number(document.getElementById('ferias-dias-input').value) || 1;

    const calc = calculateVacation(days, rate, pct);

    const hoursEl = document.getElementById('calc-ferias-hours-equiv');
    const dailyEl = document.getElementById('calc-ferias-daily-val');
    const totEl = document.getElementById('calc-ferias-total');

    if (hoursEl) hoursEl.textContent = `${calc.hoursEquivPerDay}.0h por dia (${calc.totalHoursEquiv}h equiv)`;
    if (dailyEl) dailyEl.textContent = formatCurrency(calc.dailyValue);
    if (totEl) totEl.textContent = formatCurrency(calc.totalValue);
  }

  // --- Aba 4: Relatórios & Holerite Estimado (No Período Ativo) ---
  function renderReports() {
    const { startDate, endDate } = state.calculationPeriod;
    const periodDisplay = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;

    const refLabel = document.getElementById('holerite-ref-month');
    if (refLabel) refLabel.textContent = periodDisplay;

    const filteredEntries = getFilteredEntries();
    const filteredVacations = getFilteredVacations();

    let totNormalHours = 0;
    let totNormalVal = 0;
    let totExtraHours = 0;
    let totExtraVal = 0;
    let totVacDays = 0;
    let totVacVal = 0;

    // Calcular lançamentos de trabalho e férias marcadas como diárias
    filteredEntries.forEach(entry => {
      if (entry.isVacation) {
        totVacDays += 1;
        const c = calculateShift(null, null, null, null, entry.hourlyRate, true, entry.vacationPercentage);
        totVacVal += c.totalValue;
      } else {
        const c = calculateShift(entry.startTime, entry.endTime, entry.lunchStart, entry.lunchEnd, entry.hourlyRate);
        totNormalHours += c.normalHours;
        totNormalVal += c.normalValue;
        totExtraHours += c.totalExtraHours;
        totExtraVal += c.extraValue;
      }
    });

    // Somar férias registradas na aba férias
    filteredVacations.forEach(v => {
      totVacDays += v.days;
      totVacVal += v.totalValue;
    });

    // HORAS FÍSICAS TRABALHADAS: Apenas normais + extras! Férias NÃO entram aqui!
    const totalPhysicalHours = totNormalHours + totExtraHours;
    const grandTotalSalary = totNormalVal + totExtraVal + totVacVal;

    // Métricas dos Cards
    document.getElementById('rep-normal-hours').textContent = `${totNormalHours.toFixed(1)}h`;
    document.getElementById('rep-normal-val').textContent = formatCurrency(totNormalVal);

    document.getElementById('rep-extra-hours').textContent = `${totExtraHours.toFixed(1)}h`;
    document.getElementById('rep-extra-val').textContent = formatCurrency(totExtraVal);

    document.getElementById('rep-ferias-days').textContent = `${totVacDays} dias`;
    document.getElementById('rep-ferias-val').textContent = formatCurrency(totVacVal);

    document.getElementById('rep-total-earnings').textContent = formatCurrency(grandTotalSalary);

    // Tabela discriminada Holerite
    document.getElementById('table-row-normal-ref').textContent = `${totNormalHours.toFixed(1)}h`;
    document.getElementById('table-row-normal-unit').textContent = `${formatCurrency(state.config.hourlyRate)}/h`;
    document.getElementById('table-row-normal-tot').textContent = formatCurrency(totNormalVal);

    const extraRate = state.config.hourlyRate * (1 + (state.config.overtimePercentage / 100));
    document.getElementById('table-row-extra-ref').textContent = `${totExtraHours.toFixed(1)}h`;
    document.getElementById('table-row-extra-unit').textContent = `${formatCurrency(extraRate)}/h`;
    document.getElementById('table-row-extra-tot').textContent = formatCurrency(totExtraVal);

    const singleVacDayVal = 8 * state.config.hourlyRate * (state.config.vacationPercentage / 100);
    document.getElementById('table-row-ferias-ref').textContent = `${totVacDays} dias (${totVacDays * 8}h equiv)`;
    document.getElementById('table-row-ferias-unit').textContent = `${formatCurrency(singleVacDayVal)}/dia`;
    document.getElementById('table-row-ferias-tot').textContent = formatCurrency(totVacVal);

    document.getElementById('table-row-grand-total').textContent = formatCurrency(grandTotalSalary);

    const physicalHoursEl = document.getElementById('holerite-physical-hours');
    if (physicalHoursEl) physicalHoursEl.textContent = `${totalPhysicalHours.toFixed(1)}h`;
  }

  // --- Atualização de Totais do Cabeçalho ---
  function updateHeaderEarnings() {
    const filteredEntries = getFilteredEntries();
    const filteredVacations = getFilteredVacations();

    let sum = 0;
    filteredEntries.forEach(e => {
      const c = calculateShift(e.startTime, e.endTime, e.lunchStart, e.lunchEnd, e.hourlyRate, e.isVacation, e.vacationPercentage);
      sum += c.totalValue;
    });
    filteredVacations.forEach(v => {
      sum += v.totalValue;
    });

    const el = document.getElementById('header-month-earnings');
    if (el) el.textContent = formatCurrency(sum);

    const rateDisplay = document.getElementById('header-rate-display');
    if (rateDisplay) rateDisplay.textContent = `${formatCurrency(state.config.hourlyRate)}/h`;

    const periodBtn = document.getElementById('header-period-label');
    if (periodBtn) {
      periodBtn.textContent = `${formatDateBR(state.calculationPeriod.startDate)} a ${formatDateBR(state.calculationPeriod.endDate)}`;
    }
  }

  // --- Renderização Mestra de Todas as Telas ---
  function renderAllViews() {
    updateTodayUI();
    renderHistoryTable();
    renderVacations();
    updateVacationCalcPreview();
    renderReports();
    updateHeaderEarnings();
  }

  // --- Modal de Lançamento Manual / Edição ---
  function openEntryModal(entryId = null) {
    state.editingEntryId = entryId;
    const modal = document.getElementById('entry-modal');
    const titleEl = document.getElementById('entry-modal-title').querySelector('span');

    const dateInp = document.getElementById('entry-date');
    const vacCheck = document.getElementById('entry-is-vacation');
    const startInp = document.getElementById('entry-start-time');
    const endInp = document.getElementById('entry-end-time');
    const lunchStartInp = document.getElementById('entry-lunch-start');
    const lunchEndInp = document.getElementById('entry-lunch-end');
    const rateInp = document.getElementById('entry-rate');
    const hoursSection = document.getElementById('entry-hours-section');

    if (entryId) {
      const entry = state.entries.find(e => e.id === entryId);
      if (!entry) return;

      titleEl.textContent = 'Editar Registro';
      dateInp.value = entry.date;
      vacCheck.checked = Boolean(entry.isVacation);
      startInp.value = entry.startTime || '08:00';
      endInp.value = entry.endTime || '17:00';
      lunchStartInp.value = entry.lunchStart || '12:00';
      lunchEndInp.value = entry.lunchEnd || '13:00';
      rateInp.value = entry.hourlyRate || state.config.hourlyRate;
    } else {
      titleEl.textContent = 'Novo Registro';
      dateInp.value = getTodayString();
      vacCheck.checked = false;
      startInp.value = '08:00';
      endInp.value = '17:00';
      lunchStartInp.value = '12:00';
      lunchEndInp.value = '13:00';
      rateInp.value = state.config.hourlyRate;
    }

    if (hoursSection) {
      hoursSection.style.display = vacCheck.checked ? 'none' : 'block';
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
    const isVac = document.getElementById('entry-is-vacation').checked;
    const start = document.getElementById('entry-start-time').value;
    const end = document.getElementById('entry-end-time').value;
    const lStart = document.getElementById('entry-lunch-start').value;
    const lEnd = document.getElementById('entry-lunch-end').value;
    const rate = Number(document.getElementById('entry-rate').value) || state.config.hourlyRate;

    const calc = calculateShift(start, end, lStart, lEnd, rate, isVac);

    const workedHoursEl = document.getElementById('modal-preview-worked-hours');
    const extraEl = document.getElementById('modal-preview-extra');
    const totalEl = document.getElementById('modal-preview-total');

    if (isVac) {
      workedHoursEl.textContent = '0.0h (Férias não somam em horas físicas)';
      extraEl.textContent = '0.0h';
      totalEl.textContent = `${formatCurrency(calc.totalValue)} (8h pagas no salário)`;
    } else {
      workedHoursEl.textContent = `${calc.totalWorkedHours}h (Normais: ${calc.normalHours}h)`;
      extraEl.textContent = `${calc.totalExtraHours}h`;
      totalEl.textContent = formatCurrency(calc.totalValue);
    }
  }

  // --- Exportações ---
  function exportCSV() {
    const filtered = getFilteredEntries();
    if (filtered.length === 0) {
      showToast('Nenhum dado no período para exportar.');
      return;
    }

    let csv = 'Data,Tipo,Entrada,Almoco_Saida,Almoco_Volta,Saida,Horas_Fisicas_Trabalhadas,Horas_Extras,Total_a_Receber_JPY\n';

    filtered.forEach(e => {
      const c = calculateShift(e.startTime, e.endTime, e.lunchStart, e.lunchEnd, e.hourlyRate, e.isVacation, e.vacationPercentage);
      const tipo = e.isVacation ? 'Ferias_Remuneradas' : 'Trabalho_Normal';
      csv += `${e.date},${tipo},${e.startTime || ''},${e.lunchStart || ''},${e.lunchEnd || ''},${e.endTime || ''},${c.totalWorkedHours},${c.totalExtraHours},${Math.round(c.totalValue)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pontogps-periodo-${state.calculationPeriod.startDate}-a-${state.calculationPeriod.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Planilha CSV exportada!');
  }

  function exportBackupJSON() {
    const data = {
      app: 'PontoGPS Pro ¥',
      currency: 'JPY',
      version: 3,
      exportedAt: new Date().toISOString(),
      config: state.config,
      calculationPeriod: state.calculationPeriod,
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
    showToast('Backup JSON exportado!');
  }

  // --- Configurações & Sincronização de Inputs ---
  function loadConfigForm() {
    document.getElementById('cfg-hourly-rate').value = state.config.hourlyRate;
    document.getElementById('cfg-overtime-pct').value = state.config.overtimePercentage;
    document.getElementById('cfg-vacation-pct').value = state.config.vacationPercentage || 100;
    document.getElementById('cfg-closing-day').value = state.config.closingDay || 'last';
    document.getElementById('cfg-start-time').value = state.config.standardStartTime || '08:00';
    document.getElementById('cfg-end-time').value = state.config.standardEndTime || '17:00';
    document.getElementById('cfg-work-lat').value = state.config.workLocation.lat;
    document.getElementById('cfg-work-lng').value = state.config.workLocation.lng;
    document.getElementById('cfg-work-radius').value = state.config.workLocation.radius;

    // Inputs do período global
    const pStart = document.getElementById('period-start-date');
    const pEnd = document.getElementById('period-end-date');
    if (pStart) pStart.value = state.calculationPeriod.startDate;
    if (pEnd) pEnd.value = state.calculationPeriod.endDate;

    // Input da taxa de hora na calculadora de férias
    const vacRateInp = document.getElementById('ferias-hourly-rate-input');
    const vacPctInp = document.getElementById('ferias-pct-input');
    if (vacRateInp) vacRateInp.value = state.config.hourlyRate;
    if (vacPctInp) vacPctInp.value = state.config.vacationPercentage || 100;
  }

  // --- Navegação entre Abas ---
  function switchTab(tabId) {
    state.activeTab = tabId;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active-tab');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        btn.classList.remove('active-tab');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.add('hidden');
    });

    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.remove('hidden');

    closeMobileDrawer();

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

  // --- Event Listeners ---
  function setupEventListeners() {
    // 1. Abas
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 2. Mobile Drawer
    document.getElementById('mobile-menu-btn').addEventListener('click', openMobileDrawer);
    document.getElementById('drawer-backdrop').addEventListener('click', closeMobileDrawer);

    // 3. Tema
    const toggleTheme = () => {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    };
    document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme);
    document.getElementById('mobile-theme-toggle').addEventListener('click', toggleTheme);

    // 4. Bater Ponto Principal
    document.getElementById('clock-in-btn').addEventListener('click', () => clockIn());
    document.getElementById('clock-out-btn').addEventListener('click', () => clockOut());

    // 5. Banner de Chegada
    document.getElementById('confirm-arrival-btn').addEventListener('click', () => clockIn());
    document.getElementById('dismiss-arrival-btn').addEventListener('click', () => {
      document.getElementById('arrival-alert-banner').classList.add('hidden');
    });

    // 6. Simulador GPS
    document.getElementById('sim-arrive-btn').addEventListener('click', () => {
      state.simulationActive = true;
      handleNewGPSPosition(state.config.workLocation.lat, state.config.workLocation.lng);
      showToast('Simulação: Você está DENTRO do local de trabalho! 🏢', 'success');
    });

    document.getElementById('sim-leave-btn').addEventListener('click', () => {
      state.simulationActive = true;
      handleNewGPSPosition(state.config.workLocation.lat + 0.02, state.config.workLocation.lng + 0.02);
      showToast('Simulação: Fora do local de trabalho. 🚗', 'alert');
    });

    document.getElementById('refresh-gps-btn').addEventListener('click', () => {
      state.simulationActive = false;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            handleNewGPSPosition(pos.coords.latitude, pos.coords.longitude);
            showToast('GPS real atualizado!');
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
          showToast('Local de trabalho definido!');
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

    // 9. Lançamentos e Exportações
    document.getElementById('open-manual-entry-btn').addEventListener('click', () => openEntryModal());
    document.getElementById('history-add-entry-btn').addEventListener('click', () => openEntryModal());
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    document.getElementById('export-backup-btn').addEventListener('click', exportBackupJSON);

    // 10. Controle de Período Global (Data Início e Fim do Mês)
    const pStart = document.getElementById('period-start-date');
    const pEnd = document.getElementById('period-end-date');

    const handlePeriodChange = () => {
      state.calculationPeriod.startDate = pStart.value;
      state.calculationPeriod.endDate = pEnd.value;
      savePeriod();
      renderAllViews();
      showToast('Período de cálculo atualizado!');
    };

    if (pStart) pStart.addEventListener('change', handlePeriodChange);
    if (pEnd) pEnd.addEventListener('change', handlePeriodChange);

    document.getElementById('header-period-btn').addEventListener('click', () => {
      pStart.focus();
    });

    // Presets de Período
    document.getElementById('preset-month-btn').addEventListener('click', () => {
      state.calculationPeriod = calculatePeriodRange('last');
      pStart.value = state.calculationPeriod.startDate;
      pEnd.value = state.calculationPeriod.endDate;
      savePeriod();
      renderAllViews();
      showToast('Período: Mês Calendário (01 ao 30/31)');
    });

    document.getElementById('preset-closing-20-btn').addEventListener('click', () => {
      state.calculationPeriod = calculatePeriodRange('20');
      pStart.value = state.calculationPeriod.startDate;
      pEnd.value = state.calculationPeriod.endDate;
      savePeriod();
      renderAllViews();
      showToast('Período: Fechamento dia 20 (21 ao 20)');
    });

    document.getElementById('preset-closing-25-btn').addEventListener('click', () => {
      state.calculationPeriod = calculatePeriodRange('25');
      pStart.value = state.calculationPeriod.startDate;
      pEnd.value = state.calculationPeriod.endDate;
      savePeriod();
      renderAllViews();
      showToast('Período: Fechamento dia 25 (26 ao 25)');
    });

    // Ações de Linha na Tabela de Histórico
    document.getElementById('history-table-body').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.edit-entry-btn');
      if (editBtn) {
        openEntryModal(editBtn.dataset.id);
        return;
      }

      const delBtn = e.target.closest('.delete-entry-btn');
      if (delBtn) {
        if (confirm('Deseja excluir este registro?')) {
          state.entries = state.entries.filter(en => en.id !== delBtn.dataset.id);
          saveEntries();
          renderAllViews();
          showToast('Registro excluído');
        }
      }
    });

    // 11. Modal Form de Lançamento (Com Férias)
    document.getElementById('close-entry-modal-btn').addEventListener('click', closeEntryModal);
    document.getElementById('entry-modal-cancel').addEventListener('click', closeEntryModal);

    const vacCheckbox = document.getElementById('entry-is-vacation');
    const hoursSection = document.getElementById('entry-hours-section');
    vacCheckbox.addEventListener('change', () => {
      if (hoursSection) {
        hoursSection.style.display = vacCheckbox.checked ? 'none' : 'block';
      }
      updateEntryModalPreview();
    });

    ['entry-start-time', 'entry-end-time', 'entry-lunch-start', 'entry-lunch-end', 'entry-rate'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateEntryModalPreview);
    });

    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('entry-date').value;
      const isVac = vacCheckbox.checked;
      const startTime = isVac ? null : document.getElementById('entry-start-time').value;
      const endTime = isVac ? null : document.getElementById('entry-end-time').value;
      const lunchStart = isVac ? null : document.getElementById('entry-lunch-start').value;
      const lunchEnd = isVac ? null : document.getElementById('entry-lunch-end').value;
      const rate = Number(document.getElementById('entry-rate').value) || state.config.hourlyRate;

      if (!date) return;
      if (!isVac && (!startTime || !endTime)) return;

      if (state.editingEntryId) {
        const idx = state.entries.findIndex(en => en.id === state.editingEntryId);
        if (idx >= 0) {
          state.entries[idx] = {
            ...state.entries[idx],
            date,
            isVacation: isVac,
            startTime,
            endTime,
            lunchStart,
            lunchEnd,
            hourlyRate: rate,
            vacationPercentage: state.config.vacationPercentage
          };
          showToast('Registro atualizado com sucesso!');
        }
      } else {
        const newEntry = {
          id: 'entry-' + Date.now(),
          date,
          isVacation: isVac,
          startTime,
          endTime,
          lunchStart,
          lunchEnd,
          hourlyRate: rate,
          vacationPercentage: state.config.vacationPercentage,
          notes: isVac ? 'Dia de Férias Remuneradas' : 'Lançamento manual'
        };
        state.entries.unshift(newEntry);
        showToast(isVac ? 'Dia de Férias Remuneradas registrado! 🏖️' : 'Registro de jornada adicionado!');
      }

      if (date === state.currentDay.date) {
        state.currentDay.isVacation = isVac;
        state.currentDay.startTime = startTime;
        state.currentDay.endTime = endTime;
        saveCurrentDay();
      }

      saveEntries();
      closeEntryModal();
      renderAllViews();
    });

    // 12. Calculadora e Registro de Férias
    ['ferias-hourly-rate-input', 'ferias-pct-input', 'ferias-dias-input'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateVacationCalcPreview);
    });

    document.getElementById('ferias-calc-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const rate = Number(document.getElementById('ferias-hourly-rate-input').value) || state.config.hourlyRate;
      const pct = Number(document.getElementById('ferias-pct-input').value) || state.config.vacationPercentage;
      const startDate = document.getElementById('ferias-data-inicio').value || getTodayString();
      const days = Number(document.getElementById('ferias-dias-input').value) || 1;

      const calc = calculateVacation(days, rate, pct);

      const newVac = {
        id: 'vac-' + Date.now(),
        startDate,
        days,
        hourlyRate: rate,
        percentage: pct,
        dailyHours: 8,
        totalValue: calc.totalValue,
        notes: `${days} dia(s) remunerados a ${pct}% da hora normal`
      };

      state.vacations.unshift(newVac);
      saveVacations();
      renderAllViews();
      showToast(`Férias registradas: ${formatCurrency(calc.totalValue)} somados ao salário final! 🏖️`, 'success');
    });

    document.getElementById('ferias-list-container').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.delete-vacation-btn');
      if (delBtn) {
        if (confirm('Deseja excluir este período de férias?')) {
          state.vacations = state.vacations.filter(v => v.id !== delBtn.dataset.id);
          saveVacations();
          renderAllViews();
          showToast('Férias excluídas');
        }
      }
    });

    // 13. Relatório e Impressão
    document.getElementById('print-report-btn').addEventListener('click', () => {
      window.print();
    });

    // 14. Formulário de Configurações
    document.getElementById('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      state.config.hourlyRate = Number(document.getElementById('cfg-hourly-rate').value);
      state.config.overtimePercentage = Number(document.getElementById('cfg-overtime-pct').value);
      state.config.vacationPercentage = Number(document.getElementById('cfg-vacation-pct').value);
      state.config.closingDay = document.getElementById('cfg-closing-day').value;
      state.config.standardStartTime = document.getElementById('cfg-start-time').value;
      state.config.standardEndTime = document.getElementById('cfg-end-time').value;
      state.config.workLocation.lat = Number(document.getElementById('cfg-work-lat').value);
      state.config.workLocation.lng = Number(document.getElementById('cfg-work-lng').value);
      state.config.workLocation.radius = Number(document.getElementById('cfg-work-radius').value);

      // Atualizar período de cálculo para refletir novo fechamento padrão
      state.calculationPeriod = calculatePeriodRange(state.config.closingDay);
      document.getElementById('period-start-date').value = state.calculationPeriod.startDate;
      document.getElementById('period-end-date').value = state.calculationPeriod.endDate;
      savePeriod();

      saveConfig();
      if (state.workCircle) state.workCircle.setRadius(state.config.workLocation.radius);
      updateGPSStatus();
      renderAllViews();
      showToast('Configurações salvas com sucesso em Ienes (¥)!', 'success');
    });

    document.getElementById('cfg-get-gps-btn').addEventListener('click', () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          document.getElementById('cfg-work-lat').value = pos.coords.latitude.toFixed(6);
          document.getElementById('cfg-work-lng').value = pos.coords.longitude.toFixed(6);
          showToast('Coordenadas atuais capturadas!');
        });
      }
    });

    document.getElementById('cfg-reset-defaults-btn').addEventListener('click', () => {
      if (confirm('Restaurar configurações padrões (¥ Ienes)?')) {
        state.config = { ...DEFAULT_CONFIG };
        state.calculationPeriod = calculatePeriodRange(state.config.closingDay);
        saveConfig();
        savePeriod();
        loadConfigForm();
        renderAllViews();
        showToast('Configurações restauradas.');
      }
    });
  }

  // --- Inicialização da Aplicação ---
  function init() {
    loadFromStorage();
    loadConfigForm();
    initMap();
    startGPSTracking();
    updateLiveClock();
    setInterval(updateLiveClock, 1000);
    renderAllViews();
    setupEventListeners();

    const feriasDate = document.getElementById('ferias-data-inicio');
    if (feriasDate) feriasDate.value = getTodayString();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
