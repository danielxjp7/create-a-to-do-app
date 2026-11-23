/**
 * TaskFlow — Modern & Powerful Task Manager
 * Features: Subtasks, Categories, Priority, Due Dates, Audio, Confetti, Search, Sort, Import/Export
 */

(function () {
  'use strict';

  // --- Initial Default Data ---
  const DEFAULT_CATEGORIES = [
    { id: 'cat-work', name: 'Work', color: '#3b82f6' },
    { id: 'cat-personal', name: 'Personal', color: '#10b981' },
    { id: 'cat-shopping', name: 'Shopping', color: '#f59e0b' },
    { id: 'cat-health', name: 'Health', color: '#8b5cf6' },
    { id: 'cat-learning', name: 'Learning', color: '#06b6d4' }
  ];

  const getTodayDateString = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  };

  const DEFAULT_TASKS = [
    {
      id: 'task-1',
      title: 'Finalize quarterly product roadmap',
      description: 'Prepare presentation deck and align milestones with the engineering leads.',
      categoryId: 'cat-work',
      priority: 'urgent',
      dueDate: getTodayDateString(0),
      completed: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
      subtasks: [
        { id: 'sub-1', title: 'Gather feature requests from customers', completed: true },
        { id: 'sub-2', title: 'Estimate engineering bandwidth', completed: false },
        { id: 'sub-3', title: 'Create slide deck for Monday review', completed: false }
      ]
    },
    {
      id: 'task-2',
      title: 'Morning 5km jog & stretch',
      description: 'Listen to the latest tech podcast while jogging in the park.',
      categoryId: 'cat-health',
      priority: 'medium',
      dueDate: getTodayDateString(0),
      completed: true,
      completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
      subtasks: []
    },
    {
      id: 'task-3',
      title: 'Review UX design system components',
      description: 'Check color contrast, accessibility labels, and button focus states.',
      categoryId: 'cat-work',
      priority: 'high',
      dueDate: getTodayDateString(1),
      completed: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      subtasks: [
        { id: 'sub-4', title: 'Audit button state transitions', completed: true },
        { id: 'sub-5', title: 'Test dark mode contrast tokens', completed: false }
      ]
    },
    {
      id: 'task-4',
      title: 'Weekly grocery shopping',
      description: 'Organic vegetables, Greek yogurt, sourdough bread, and coffee beans.',
      categoryId: 'cat-shopping',
      priority: 'medium',
      dueDate: getTodayDateString(2),
      completed: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      subtasks: [
        { id: 'sub-6', title: 'Fresh vegetables & greens', completed: false },
        { id: 'sub-7', title: 'Whole bean espresso blend', completed: false }
      ]
    },
    {
      id: 'task-5',
      title: 'Read System Design & Architecture Chapter 4',
      description: 'Take detailed notes on distributed event streaming and message brokers.',
      categoryId: 'cat-learning',
      priority: 'low',
      dueDate: getTodayDateString(3),
      completed: false,
      completedAt: null,
      createdAt: new Date(Date.now() - 3600000 * 28).toISOString(),
      subtasks: []
    }
  ];

  // --- State ---
  const state = {
    tasks: [],
    categories: [],
    view: 'all', // 'all' | 'today' | 'upcoming' | 'completed' | 'cat:<id>'
    statusFilter: 'all', // 'all' | 'active' | 'completed'
    priorityFilter: null, // null | 'urgent' | 'high' | 'medium' | 'low'
    searchQuery: '',
    sortBy: 'dueDate', // 'dueDate' | 'priority' | 'createdAt' | 'alphabetical'
    soundEnabled: true,
    darkMode: false,
    editingTaskId: null,
    modalSubtasks: [],
    undoAction: null
  };

  // --- Audio Synthesis via Web Audio API ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playChimeSound() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      
      const now = ctx.currentTime;
      // Note 1: E5 (659.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: B5 (987.77Hz) slightly delayed for a bright success chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.08);
      gain2.gain.setValueAtTime(0.12, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  function playPopSound() {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // --- Confetti Celebration ---
  function fireConfetti() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.75 },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
      });
    }
  }

  // --- Storage ---
  function loadState() {
    try {
      const storedTasks = localStorage.getItem('taskflow_tasks');
      state.tasks = storedTasks ? JSON.parse(storedTasks) : DEFAULT_TASKS;

      const storedCategories = localStorage.getItem('taskflow_categories');
      state.categories = storedCategories ? JSON.parse(storedCategories) : DEFAULT_CATEGORIES;

      const storedSound = localStorage.getItem('taskflow_sound');
      if (storedSound !== null) {
        state.soundEnabled = JSON.parse(storedSound);
      }

      const storedTheme = localStorage.getItem('taskflow_theme');
      if (storedTheme) {
        state.darkMode = storedTheme === 'dark';
      } else {
        state.darkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      state.tasks = DEFAULT_TASKS;
      state.categories = DEFAULT_CATEGORIES;
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem('taskflow_tasks', JSON.stringify(state.tasks));
    } catch (e) {
      console.error('Failed to save tasks to localStorage:', e);
    }
  }

  function saveCategories() {
    try {
      localStorage.setItem('taskflow_categories', JSON.stringify(state.categories));
    } catch (e) {
      console.error('Failed to save categories to localStorage:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('taskflow_sound', JSON.stringify(state.soundEnabled));
      localStorage.setItem('taskflow_theme', state.darkMode ? 'dark' : 'light');
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // --- Theme Sync ---
  function applyTheme() {
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    saveSettings();
  }

  // --- Sound Setting Sync ---
  function updateSoundUI() {
    const icon = document.getElementById('sound-icon');
    if (!icon) return;
    if (state.soundEnabled) {
      icon.setAttribute('data-lucide', 'volume-2');
      icon.parentElement.classList.remove('opacity-40');
    } else {
      icon.setAttribute('data-lucide', 'volume-x');
      icon.parentElement.classList.add('opacity-40');
    }
    if (window.lucide) lucide.createIcons();
  }

  // --- Toast Notifications ---
  function showToast(message, actionLabel = null, onAction = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl shadow-xl border border-slate-700 dark:border-slate-200 text-xs font-medium';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (actionLabel && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'font-bold underline text-brand-400 dark:text-brand-600 hover:opacity-80 transition-opacity ml-2';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', () => {
        onAction();
        toast.remove();
      });
      toast.appendChild(actionBtn);
    }

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px) scale(0.95)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }

  // --- Helpers ---
  function getCategory(categoryId) {
    return state.categories.find(c => c.id === categoryId) || {
      id: 'default',
      name: 'General',
      color: '#64748b'
    };
  }

  function formatDueDate(dateString) {
    if (!dateString) return null;
    const todayStr = getTodayDateString(0);
    const tomorrowStr = getTodayDateString(1);
    const yesterdayStr = getTodayDateString(-1);

    if (dateString === todayStr) {
      return { text: 'Today', isOverdue: false, isToday: true, isUpcoming: false };
    }
    if (dateString === tomorrowStr) {
      return { text: 'Tomorrow', isOverdue: false, isToday: false, isUpcoming: true };
    }
    if (dateString < todayStr) {
      return { text: dateString, isOverdue: true, isToday: false, isUpcoming: false };
    }

    // Format YYYY-MM-DD to readable (e.g., Nov 25)
    try {
      const parts = dateString.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { text: formatted, isOverdue: false, isToday: false, isUpcoming: true };
    } catch (e) {
      return { text: dateString, isOverdue: false, isToday: false, isUpcoming: true };
    }
  }

  function getPriorityWeight(priority) {
    switch (priority) {
      case 'urgent': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  // --- Filtering & Sorting Tasks ---
  function getFilteredAndSortedTasks() {
    const todayStr = getTodayDateString(0);

    return state.tasks.filter(task => {
      // 1. View filter
      if (state.view === 'today') {
        if (task.dueDate !== todayStr) return false;
      } else if (state.view === 'upcoming') {
        if (!task.dueDate || task.dueDate <= todayStr) return false;
      } else if (state.view === 'completed') {
        if (!task.completed) return false;
      } else if (state.view.startsWith('cat:')) {
        const catId = state.view.replace('cat:', '');
        if (task.categoryId !== catId) return false;
      }

      // 2. Status Pill filter (All, Active, Completed)
      if (state.statusFilter === 'active' && task.completed) return false;
      if (state.statusFilter === 'completed' && !task.completed) return false;

      // 3. Priority filter
      if (state.priorityFilter && task.priority !== state.priorityFilter) {
        return false;
      }

      // 4. Search Query
      if (state.searchQuery.trim()) {
        const query = state.searchQuery.toLowerCase().trim();
        const matchesTitle = task.title.toLowerCase().includes(query);
        const matchesDesc = (task.description || '').toLowerCase().includes(query);
        const cat = getCategory(task.categoryId);
        const matchesCat = cat.name.toLowerCase().includes(query);
        const matchesSubtasks = (task.subtasks || []).some(s => s.title.toLowerCase().includes(query));

        if (!matchesTitle && !matchesDesc && !matchesCat && !matchesSubtasks) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Completed items always sort to bottom unless viewing specifically completed
      if (state.view !== 'completed' && a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      if (state.sortBy === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      } else if (state.sortBy === 'priority') {
        return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
      } else if (state.sortBy === 'alphabetical') {
        return a.title.localeCompare(b.title);
      } else if (state.sortBy === 'createdAt') {
        return new Date(b.createdAt) - new Date(a.createdAt);
      }
      return 0;
    });
  }

  // --- Render Counts & Navigation ---
  function updateSidebarCounts() {
    const todayStr = getTodayDateString(0);
    
    // View counts
    const countAll = state.tasks.filter(t => !t.completed).length;
    const countToday = state.tasks.filter(t => !t.completed && t.dueDate === todayStr).length;
    const countUpcoming = state.tasks.filter(t => !t.completed && t.dueDate && t.dueDate > todayStr).length;
    const countCompleted = state.tasks.filter(t => t.completed).length;

    document.getElementById('count-all').textContent = countAll;
    document.getElementById('count-today').textContent = countToday;
    document.getElementById('count-upcoming').textContent = countUpcoming;
    document.getElementById('count-completed').textContent = countCompleted;

    // Priority counts (active only)
    document.getElementById('count-urgent').textContent = state.tasks.filter(t => !t.completed && t.priority === 'urgent').length;
    document.getElementById('count-high').textContent = state.tasks.filter(t => !t.completed && t.priority === 'high').length;
    document.getElementById('count-medium').textContent = state.tasks.filter(t => !t.completed && t.priority === 'medium').length;
    document.getElementById('count-low').textContent = state.tasks.filter(t => !t.completed && t.priority === 'low').length;

    // Productivity bar calculations
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    document.getElementById('stat-completed-count').textContent = completed;
    document.getElementById('stat-total-count').textContent = total;
    document.getElementById('stat-percent').textContent = `${percent}%`;

    const ring = document.getElementById('stat-progress-ring');
    if (ring) {
      // Circumference = 2 * PI * 16 ≈ 100
      const offset = 100 - (100 * percent / 100);
      ring.style.strokeDashoffset = offset;
    }

    const encouragement = document.getElementById('stat-encouragement');
    if (encouragement) {
      if (percent === 100 && total > 0) {
        encouragement.textContent = '🎉 All caught up! Stellar work!';
      } else if (percent >= 70) {
        encouragement.textContent = 'Almost there! Finish strong.';
      } else if (percent > 0) {
        encouragement.textContent = 'Good momentum, keep going!';
      } else {
        encouragement.textContent = 'Ready to make progress?';
      }
    }
  }

  function renderCategoryList() {
    const listEl = document.getElementById('category-list');
    const quickSelect = document.getElementById('quick-task-category');
    const modalSelect = document.getElementById('task-category-select');

    if (!listEl) return;
    listEl.innerHTML = '';
    if (quickSelect) quickSelect.innerHTML = '';
    if (modalSelect) modalSelect.innerHTML = '';

    state.categories.forEach(cat => {
      const catCount = state.tasks.filter(t => !t.completed && t.categoryId === cat.id).length;
      const isCurrentView = state.view === `cat:${cat.id}`;

      // Sidebar button
      const btn = document.createElement('button');
      btn.className = `w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-medium transition-all group ${
        isCurrentView 
          ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
      }`;
      btn.dataset.categoryView = cat.id;
      btn.innerHTML = `
        <span class="flex items-center gap-2.5">
          <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${cat.color}"></span>
          <span class="truncate">${cat.name}</span>
        </span>
        <span class="text-[11px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">${catCount}</span>
      `;
      btn.addEventListener('click', () => {
        state.view = `cat:${cat.id}`;
        state.priorityFilter = null;
        updateNavState();
        render();
        closeSidebarOnMobile();
      });
      listEl.appendChild(btn);

      // Populate Quick Select
      if (quickSelect) {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        quickSelect.appendChild(opt);
      }

      // Populate Modal Select
      if (modalSelect) {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        modalSelect.appendChild(opt);
      }
    });
  }

  function updateNavState() {
    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      const v = item.dataset.view;
      if (v === state.view) {
        item.classList.add('active-nav');
        item.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        item.classList.remove('active-nav');
        item.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    // Priority filter items
    document.querySelectorAll('.priority-nav-item').forEach(item => {
      const p = item.dataset.priorityFilter;
      if (p === state.priorityFilter) {
        item.classList.add('active-nav');
      } else {
        item.classList.remove('active-nav');
      }
    });

    // Status filter pills
    document.querySelectorAll('.status-pill').forEach(pill => {
      if (pill.dataset.statusFilter === state.statusFilter) {
        pill.classList.add('active-pill');
        pill.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        pill.classList.remove('active-pill');
        pill.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    });

    // View title and subtitle
    const titleEl = document.getElementById('view-title');
    const subEl = document.getElementById('view-subtitle');
    const filterBadge = document.getElementById('active-filter-badge');

    if (state.view === 'all') {
      titleEl.textContent = 'All Tasks';
      subEl.textContent = 'Stay organized and get things done effortlessly';
    } else if (state.view === 'today') {
      titleEl.textContent = 'Today';
      subEl.textContent = `Tasks scheduled for ${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`;
    } else if (state.view === 'upcoming') {
      titleEl.textContent = 'Upcoming';
      subEl.textContent = 'Plan ahead and stay on top of deadlines';
    } else if (state.view === 'completed') {
      titleEl.textContent = 'Completed';
      subEl.textContent = 'Look at all the achievements you unlocked';
    } else if (state.view.startsWith('cat:')) {
      const cat = getCategory(state.view.replace('cat:', ''));
      titleEl.textContent = cat.name;
      subEl.textContent = `Tasks filed under category "${cat.name}"`;
    }

    // Active Priority badge / Reset button
    const resetContainer = document.getElementById('filter-reset-container');
    if (state.priorityFilter || state.searchQuery) {
      resetContainer.classList.remove('hidden');
      if (state.priorityFilter) {
        filterBadge.classList.remove('hidden');
        filterBadge.textContent = `Priority: ${state.priorityFilter.toUpperCase()}`;
      } else {
        filterBadge.classList.add('hidden');
      }
    } else {
      resetContainer.classList.add('hidden');
      filterBadge.classList.add('hidden');
    }
  }

  // --- Render Task Cards ---
  function renderTaskList() {
    const container = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');
    if (!container) return;

    const filtered = getFilteredAndSortedTasks();

    if (filtered.length === 0) {
      container.innerHTML = '';
      emptyState.classList.remove('hidden');
      
      const emptyTitle = document.getElementById('empty-title');
      const emptyDesc = document.getElementById('empty-desc');
      if (state.searchQuery) {
        emptyTitle.textContent = 'No matching tasks';
        emptyDesc.textContent = `No tasks found matching "${state.searchQuery}". Try a different search term.`;
      } else if (state.view === 'completed') {
        emptyTitle.textContent = 'No completed tasks yet';
        emptyDesc.textContent = 'Complete some tasks from your list to see them here!';
      } else if (state.view === 'today') {
        emptyTitle.textContent = 'No tasks due today';
        emptyDesc.textContent = 'Your schedule for today is crystal clear!';
      } else {
        emptyTitle.textContent = 'No tasks found';
        emptyDesc.textContent = "You're all caught up! Add a new task to stay on top of your goals.";
      }
      return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = '';

    filtered.forEach(task => {
      const cat = getCategory(task.categoryId);
      const dueDateInfo = formatDueDate(task.dueDate);
      const subtasks = task.subtasks || [];
      const completedSubtasks = subtasks.filter(s => s.completed).length;

      const card = document.createElement('div');
      card.className = `task-card group relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-all ${
        task.completed ? 'task-completed bg-slate-50/50 dark:bg-slate-900/40' : ''
      }`;
      card.dataset.taskId = task.id;

      // Priority Badge
      const priorityClass = `badge-${task.priority}`;

      // Due Date Badge HTML
      let dueBadgeHtml = '';
      if (dueDateInfo) {
        let badgeStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
        if (dueDateInfo.isOverdue && !task.completed) {
          badgeStyle = 'badge-overdue font-semibold';
        } else if (dueDateInfo.isToday && !task.completed) {
          badgeStyle = 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-semibold';
        }
        dueBadgeHtml = `
          <span class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg ${badgeStyle}">
            <i data-lucide="calendar" class="w-3 h-3"></i>
            <span>${dueDateInfo.isOverdue && !task.completed ? 'Overdue: ' : ''}${dueDateInfo.text}</span>
          </span>
        `;
      }

      // Subtasks Summary HTML
      let subtasksHtml = '';
      if (subtasks.length > 0) {
        const percent = Math.round((completedSubtasks / subtasks.length) * 100);
        subtasksHtml = `
          <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
            <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
              <span class="flex items-center gap-1 font-medium">
                <i data-lucide="list-checks" class="w-3.5 h-3.5 text-slate-400"></i>
                <span>Subtasks (${completedSubtasks}/${subtasks.length})</span>
              </span>
              <span class="font-semibold">${percent}%</span>
            </div>
            <!-- Progress Bar -->
            <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="bg-brand-600 dark:bg-brand-500 h-full rounded-full transition-all duration-300" style="width: ${percent}%"></div>
            </div>

            <!-- Subtask mini checklist -->
            <div class="space-y-1.5 mt-2.5">
              ${subtasks.map(sub => `
                <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                  <input type="checkbox" data-task-id="${task.id}" data-subtask-id="${sub.id}" class="subtask-toggle rounded border-slate-300 dark:border-slate-700 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer" ${sub.completed ? 'checked' : ''}>
                  <span class="${sub.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}">${escapeHtml(sub.title)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="flex items-start gap-3.5">
          <!-- Main Checkbox -->
          <label class="custom-checkbox mt-0.5" title="Mark as ${task.completed ? 'incomplete' : 'completed'}">
            <input type="checkbox" class="task-toggle" data-id="${task.id}" ${task.completed ? 'checked' : ''}>
            <span class="checkbox-mark">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
          </label>

          <!-- Task Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <h3 class="task-title font-semibold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate ${task.completed ? 'completed' : ''}">
                ${escapeHtml(task.title)}
              </h3>

              <!-- Actions on Hover / Menu -->
              <div class="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <button class="edit-task-btn p-1.5 rounded-lg text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-id="${task.id}" title="Edit task">
                  <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                </button>
                <button class="duplicate-task-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" data-id="${task.id}" title="Duplicate task">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
                <button class="delete-task-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors" data-id="${task.id}" title="Delete task">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <!-- Description (if any) -->
            ${task.description ? `
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                ${escapeHtml(task.description)}
              </p>
            ` : ''}

            <!-- Metadata Badges -->
            <div class="flex flex-wrap items-center gap-2 mt-2.5">
              <!-- Category Pill -->
              <span class="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span class="w-1.5 h-1.5 rounded-full" style="background-color: ${cat.color}"></span>
                <span>${cat.name}</span>
              </span>

              <!-- Priority Pill -->
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-lg uppercase tracking-wide ${priorityClass}">
                ${task.priority}
              </span>

              <!-- Due Date Pill -->
              ${dueBadgeHtml}
            </div>

            <!-- Subtasks Container -->
            ${subtasksHtml}
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Task Operations ---
  function addTask({ title, description, categoryId, priority, dueDate, subtasks = [] }) {
    if (!title || !title.trim()) return;

    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: title.trim(),
      description: (description || '').trim(),
      categoryId: categoryId || (state.categories[0] ? state.categories[0].id : 'cat-work'),
      priority: priority || 'medium',
      dueDate: dueDate || null,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      subtasks: subtasks
    };

    state.tasks.unshift(newTask);
    saveTasks();
    render();
    showToast('Task added successfully');
  }

  function updateTask(id, updates) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;

    state.tasks[idx] = {
      ...state.tasks[idx],
      ...updates
    };

    saveTasks();
    render();
  }

  function toggleTaskCompletion(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    const newCompleted = !task.completed;
    task.completed = newCompleted;
    task.completedAt = newCompleted ? new Date().toISOString() : null;

    saveTasks();
    render();

    if (newCompleted) {
      playChimeSound();
      fireConfetti();
      showToast(`Task completed! 🎉`, 'Undo', () => {
        task.completed = false;
        task.completedAt = null;
        saveTasks();
        render();
      });
    }
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub) return;

    sub.completed = !sub.completed;

    // If all subtasks completed, check if parent should complete
    const allDone = task.subtasks.length > 0 && task.subtasks.every(s => s.completed);
    if (allDone && !task.completed) {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      playChimeSound();
      fireConfetti();
      showToast('All subtasks completed! Task marked done. 🚀');
    }

    saveTasks();
    render();
  }

  function deleteTask(id) {
    const idx = state.tasks.findIndex(t => t.id === id);
    if (idx === -1) return;

    const [deletedTask] = state.tasks.splice(idx, 1);
    saveTasks();
    render();
    playPopSound();

    showToast(`Deleted "${deletedTask.title}"`, 'Undo', () => {
      state.tasks.splice(idx, 0, deletedTask);
      saveTasks();
      render();
    });
  }

  function duplicateTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    const clone = {
      ...task,
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: `${task.title} (Copy)`,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      subtasks: (task.subtasks || []).map(s => ({ ...s, id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5), completed: false }))
    };

    state.tasks.unshift(clone);
    saveTasks();
    render();
    showToast('Task duplicated');
  }

  function clearCompletedTasks() {
    const completedCount = state.tasks.filter(t => t.completed).length;
    if (completedCount === 0) {
      showToast('No completed tasks to clear.');
      return;
    }

    if (!confirm(`Are you sure you want to permanently clear ${completedCount} completed task(s)?`)) {
      return;
    }

    const removed = state.tasks.filter(t => t.completed);
    state.tasks = state.tasks.filter(t => !t.completed);
    saveTasks();
    render();
    showToast(`Cleared ${completedCount} completed task(s).`, 'Undo', () => {
      state.tasks.push(...removed);
      saveTasks();
      render();
    });
  }

  // --- Modal Operations (Add / Edit) ---
  function openTaskModal(taskId = null) {
    state.editingTaskId = taskId;
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title').querySelector('span');
    const deleteBtn = document.getElementById('modal-delete-btn');
    const submitText = document.getElementById('modal-submit-text');

    const titleInput = document.getElementById('task-title-input');
    const descInput = document.getElementById('task-desc-input');
    const catSelect = document.getElementById('task-category-select');
    const prioritySelect = document.getElementById('task-priority-select');
    const dueInput = document.getElementById('task-due-date-input');

    if (taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      modalTitle.textContent = 'Edit Task';
      submitText.textContent = 'Save Changes';
      deleteBtn.classList.remove('hidden');

      titleInput.value = task.title;
      descInput.value = task.description || '';
      catSelect.value = task.categoryId;
      prioritySelect.value = task.priority;
      dueInput.value = task.dueDate || '';
      state.modalSubtasks = (task.subtasks || []).map(s => ({ ...s }));
    } else {
      modalTitle.textContent = 'Create Task';
      submitText.textContent = 'Create Task';
      deleteBtn.classList.add('hidden');

      titleInput.value = '';
      descInput.value = '';
      catSelect.value = state.categories[0] ? state.categories[0].id : '';
      prioritySelect.value = 'medium';
      dueInput.value = state.view === 'today' ? getTodayDateString(0) : '';
      state.modalSubtasks = [];
    }

    renderModalSubtasks();
    modal.classList.remove('hidden');
    setTimeout(() => {
      titleInput.focus();
    }, 100);
  }

  function closeTaskModal() {
    const modal = document.getElementById('task-modal');
    modal.classList.add('hidden');
    state.editingTaskId = null;
    state.modalSubtasks = [];
  }

  function renderModalSubtasks() {
    const list = document.getElementById('modal-subtasks-list');
    const countLabel = document.getElementById('subtasks-count-label');
    if (!list) return;

    countLabel.textContent = `${state.modalSubtasks.length} items`;
    list.innerHTML = '';

    state.modalSubtasks.forEach((sub, idx) => {
      const div = document.createElement('div');
      div.className = 'flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 rounded-xl text-xs border border-slate-200/70 dark:border-slate-700/60';
      div.innerHTML = `
        <label class="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
          <input type="checkbox" class="modal-subtask-check rounded text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer" data-idx="${idx}" ${sub.completed ? 'checked' : ''}>
          <span class="truncate ${sub.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}">${escapeHtml(sub.title)}</span>
        </label>
        <button type="button" class="modal-subtask-del text-slate-400 hover:text-rose-500 transition-colors p-1" data-idx="${idx}">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      `;
      list.appendChild(div);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Category Modal Operations ---
  function openCategoryModal() {
    const modal = document.getElementById('category-modal');
    const input = document.getElementById('cat-name-input');
    input.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
  }

  function closeCategoryModal() {
    const modal = document.getElementById('category-modal');
    modal.classList.add('hidden');
  }

  // --- Mobile Sidebar Helper ---
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = !sidebar.classList.contains('-translate-x-full');

    if (isOpen) {
      sidebar.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
    } else {
      sidebar.classList.remove('-translate-x-full');
      backdrop.classList.remove('hidden');
    }
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth < 1024) {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebar-backdrop');
      sidebar.classList.add('-translate-x-full');
      backdrop.classList.add('hidden');
    }
  }

  // --- Export & Import Data ---
  function exportData() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: state.tasks,
      categories: state.categories
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskflow-backup-${getTodayDateString(0)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup file downloaded.');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (Array.isArray(parsed.tasks)) {
          state.tasks = parsed.tasks;
          if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
            state.categories = parsed.categories;
          }
          saveTasks();
          saveCategories();
          render();
          showToast('Data imported successfully!');
        } else {
          showToast('Invalid backup file structure.');
        }
      } catch (err) {
        showToast('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
  }

  // --- Main Master Render ---
  function render() {
    updateSidebarCounts();
    renderCategoryList();
    updateNavState();
    renderTaskList();
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // 1. Navigation clicks (All, Today, Upcoming, Completed)
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        state.priorityFilter = null;
        updateNavState();
        render();
        closeSidebarOnMobile();
      });
    });

    // 2. Priority Nav clicks
    document.querySelectorAll('.priority-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.dataset.priorityFilter;
        state.priorityFilter = state.priorityFilter === p ? null : p;
        updateNavState();
        render();
        closeSidebarOnMobile();
      });
    });

    // 3. Status filter pills (All, Active, Completed)
    document.querySelectorAll('.status-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        state.statusFilter = pill.dataset.statusFilter;
        updateNavState();
        render();
      });
    });

    // 4. Reset Filters button
    document.getElementById('clear-all-filters-btn').addEventListener('click', () => {
      state.priorityFilter = null;
      state.searchQuery = '';
      document.getElementById('search-input').value = '';
      document.getElementById('clear-search-btn').classList.add('hidden');
      updateNavState();
      render();
    });

    // 5. Search Bar input
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery.trim()) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
      }
      render();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.classList.add('hidden');
      render();
      searchInput.focus();
    });

    // 6. Sort Dropdown
    const sortMenuBtn = document.getElementById('sort-menu-btn');
    const sortDropdown = document.getElementById('sort-dropdown');
    const sortLabel = document.getElementById('current-sort-label');

    sortMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortDropdown.classList.toggle('hidden');
    });

    document.querySelectorAll('.sort-option').forEach(opt => {
      opt.addEventListener('click', () => {
        state.sortBy = opt.dataset.sort;
        const labelText = opt.querySelector('span').textContent;
        sortLabel.textContent = `Sort: ${labelText.split('(')[0].trim()}`;
        sortDropdown.classList.add('hidden');
        render();
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      sortDropdown.classList.add('hidden');
      const dataDropdown = document.getElementById('data-dropdown');
      if (dataDropdown) dataDropdown.classList.add('hidden');
    });

    // 7. Quick Inline Add Task Form
    const quickAddForm = document.getElementById('quick-add-form');
    quickAddForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('quick-task-title');
      const catSelect = document.getElementById('quick-task-category');
      const prioritySelect = document.getElementById('quick-task-priority');
      const dueInput = document.getElementById('quick-task-due');

      const title = titleInput.value.trim();
      if (!title) return;

      addTask({
        title,
        categoryId: catSelect.value,
        priority: prioritySelect.value,
        dueDate: dueInput.value || (state.view === 'today' ? getTodayDateString(0) : null)
      });

      titleInput.value = '';
      titleInput.focus();
    });

    // Expand to detailed modal from quick add
    document.getElementById('expand-to-modal-btn').addEventListener('click', () => {
      const titleInput = document.getElementById('quick-task-title');
      openTaskModal();
      if (titleInput.value.trim()) {
        document.getElementById('task-title-input').value = titleInput.value.trim();
        titleInput.value = '';
      }
    });

    // 8. Task List Event Delegation (Checkbox, Edit, Delete, Duplicate, Subtasks)
    const taskListContainer = document.getElementById('task-list');

    taskListContainer.addEventListener('click', (e) => {
      // Toggle Task Complete
      const toggle = e.target.closest('.task-toggle');
      if (toggle) {
        toggleTaskCompletion(toggle.dataset.id);
        return;
      }

      // Edit Task Button
      const editBtn = e.target.closest('.edit-task-btn');
      if (editBtn) {
        openTaskModal(editBtn.dataset.id);
        return;
      }

      // Delete Task Button
      const delBtn = e.target.closest('.delete-task-btn');
      if (delBtn) {
        deleteTask(delBtn.dataset.id);
        return;
      }

      // Duplicate Task Button
      const dupBtn = e.target.closest('.duplicate-task-btn');
      if (dupBtn) {
        duplicateTask(dupBtn.dataset.id);
        return;
      }

      // Toggle Subtask
      const subtaskCheck = e.target.closest('.subtask-toggle');
      if (subtaskCheck) {
        toggleSubtask(subtaskCheck.dataset.taskId, subtaskCheck.dataset.subtaskId);
        return;
      }
    });

    // 9. Task Form Submission in Modal
    const taskForm = document.getElementById('task-form');
    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('task-title-input').value.trim();
      const desc = document.getElementById('task-desc-input').value.trim();
      const categoryId = document.getElementById('task-category-select').value;
      const priority = document.getElementById('task-priority-select').value;
      const dueDate = document.getElementById('task-due-date-input').value;

      if (!title) return;

      if (state.editingTaskId) {
        updateTask(state.editingTaskId, {
          title,
          description: desc,
          categoryId,
          priority,
          dueDate: dueDate || null,
          subtasks: state.modalSubtasks
        });
        showToast('Task updated');
      } else {
        addTask({
          title,
          description: desc,
          categoryId,
          priority,
          dueDate: dueDate || null,
          subtasks: state.modalSubtasks
        });
      }

      closeTaskModal();
    });

    // Modal Subtasks (Add & Delete)
    const addSubtaskBtn = document.getElementById('add-subtask-btn');
    const newSubtaskInput = document.getElementById('new-subtask-input');

    const handleAddSubtask = () => {
      const text = newSubtaskInput.value.trim();
      if (!text) return;
      state.modalSubtasks.push({
        id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5),
        title: text,
        completed: false
      });
      newSubtaskInput.value = '';
      renderModalSubtasks();
      newSubtaskInput.focus();
    };

    addSubtaskBtn.addEventListener('click', handleAddSubtask);
    newSubtaskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSubtask();
      }
    });

    document.getElementById('modal-subtasks-list').addEventListener('click', (e) => {
      const delBtn = e.target.closest('.modal-subtask-del');
      if (delBtn) {
        const idx = parseInt(delBtn.dataset.idx, 10);
        state.modalSubtasks.splice(idx, 1);
        renderModalSubtasks();
        return;
      }

      const check = e.target.closest('.modal-subtask-check');
      if (check) {
        const idx = parseInt(check.dataset.idx, 10);
        state.modalSubtasks[idx].completed = check.checked;
        renderModalSubtasks();
        return;
      }
    });

    // Delete in Modal
    document.getElementById('modal-delete-btn').addEventListener('click', () => {
      if (state.editingTaskId) {
        deleteTask(state.editingTaskId);
        closeTaskModal();
      }
    });

    // Close Modal buttons
    document.getElementById('close-modal-btn').addEventListener('click', closeTaskModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeTaskModal);
    document.getElementById('task-modal').addEventListener('click', (e) => {
      if (e.target.id === 'task-modal') closeTaskModal();
    });

    // 10. Buttons to open Create Task Modal
    document.getElementById('sidebar-new-task-btn').addEventListener('click', () => openTaskModal());
    document.getElementById('header-add-task-btn').addEventListener('click', () => openTaskModal());
    document.getElementById('empty-add-btn').addEventListener('click', () => openTaskModal());

    // 11. Category Modal & Form
    document.getElementById('add-category-btn').addEventListener('click', openCategoryModal);
    document.getElementById('close-category-modal-btn').addEventListener('click', closeCategoryModal);
    document.getElementById('cancel-category-btn').addEventListener('click', closeCategoryModal);
    document.getElementById('category-modal').addEventListener('click', (e) => {
      if (e.target.id === 'category-modal') closeCategoryModal();
    });

    document.getElementById('category-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('cat-name-input');
      const name = nameInput.value.trim();
      const colorInput = document.querySelector('input[name="cat-color"]:checked');
      const color = colorInput ? colorInput.value : '#3b82f6';

      if (!name) return;

      const newCat = {
        id: 'cat-' + Date.now(),
        name,
        color
      };

      state.categories.push(newCat);
      saveCategories();
      render();
      closeCategoryModal();
      showToast(`Category "${name}" created!`);
    });

    // 12. Theme Toggle
    document.getElementById('theme-toggle-btn').addEventListener('click', () => {
      state.darkMode = !state.darkMode;
      applyTheme();
    });

    // 13. Sound Toggle
    document.getElementById('sound-toggle-btn').addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      saveSettings();
      updateSoundUI();
      showToast(state.soundEnabled ? 'Sound enabled 🔔' : 'Sound muted 🔕');
      if (state.soundEnabled) playChimeSound();
    });

    // 14. Data Menu (Export, Import, Clear Completed)
    const dataMenuBtn = document.getElementById('data-menu-btn');
    const dataDropdown = document.getElementById('data-dropdown');

    dataMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dataDropdown.classList.toggle('hidden');
    });

    document.getElementById('export-data-btn').addEventListener('click', () => {
      dataDropdown.classList.add('hidden');
      exportData();
    });

    document.getElementById('import-file-input').addEventListener('change', (e) => {
      dataDropdown.classList.add('hidden');
      if (e.target.files && e.target.files[0]) {
        importData(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('clear-completed-btn').addEventListener('click', () => {
      dataDropdown.classList.add('hidden');
      clearCompletedTasks();
    });

    // 15. Mobile Sidebar Toggle
    document.getElementById('open-sidebar-btn').addEventListener('click', toggleSidebar);
    document.getElementById('close-sidebar-btn').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-backdrop').addEventListener('click', toggleSidebar);

    // 16. Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      // Escape closes modals or clears search
      if (e.key === 'Escape') {
        const taskModal = document.getElementById('task-modal');
        const catModal = document.getElementById('category-modal');
        if (!taskModal.classList.contains('hidden')) {
          closeTaskModal();
          return;
        }
        if (!catModal.classList.contains('hidden')) {
          closeCategoryModal();
          return;
        }
        if (state.searchQuery) {
          searchInput.value = '';
          state.searchQuery = '';
          clearSearchBtn.classList.add('hidden');
          render();
        }
      }

      // Only handle shortcut if not typing in an input
      if (!isInputActive) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          openTaskModal();
        } else if (e.key === '/') {
          e.preventDefault();
          searchInput.focus();
        }
      }
    });
  }

  // --- Initialize App ---
  function init() {
    loadState();
    applyTheme();
    updateSoundUI();
    render();
    setupEventListeners();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
