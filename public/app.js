/* -------------------------------------------------------------
 * Zynic Web Player Logic
 * High fidelity music streaming, local library, synced lyrics
 * ------------------------------------------------------------- */

// State Management
const state = {
    currentTab: 'home',
    history: ['home'],
    historyIndex: 0,
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isMuted: false,
    volume: 0.8,
    repeatMode: 'none', // 'none' | 'one' | 'all'
    isShuffled: false,
    originalQueue: [], // For shuffle rollback
    likedTracks: [],
    recentTracks: [],
    userPlaylists: [],
    syncedLyrics: [], // [{time: seconds, text: string}]
    activeLyricsIndex: -1,
    isMiniProgressDragging: false,
    settings: {
        themeMode: 'dark', // 'dark' | 'auto' | 'oled'
        dynamicTheme: true,
        accentColor: '#ec5464',
        showPet: true
    },
    cache: {
        home: null,
        homeTime: 0,
        explore: null,
        exploreTime: 0,
        charts: null,
        chartsTime: 0,
        details: {}, // id -> { data, time }
        recommendations: null
    }
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

function isCacheValid(timestamp) {
    return timestamp && (Date.now() - timestamp < CACHE_DURATION);
}

function getTrackThumbnail(track, defaultWidth = 300) {
    if (!track) {
        return `https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=${defaultWidth}`;
    }
    
    // Check if thumbnail is already set
    if (track.thumbnail) {
        return track.thumbnail;
    }
    
    // If it's a song/video (ID is 11 characters)
    const id = track.id || track.videoId;
    if (id && id.length === 11 && !id.startsWith('user_')) {
        return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    
    // Unsplash placeholders based on size
    if (defaultWidth >= 400) {
        return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=400';
    } else if (defaultWidth >= 300) {
        return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300';
    }
    return 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=150';
}

function handleImageError(imgEl, trackId, defaultWidth = 150) {
    if (trackId && trackId.length === 11 && !trackId.startsWith('user_') && !imgEl.src.includes('ytimg.com')) {
        imgEl.src = `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`;
    } else {
        imgEl.src = `https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=${defaultWidth}`;
    }
}

// DOM Cache
const dom = {
    audio: document.getElementById('audio-player'),
    navItems: document.querySelectorAll('.nav-item'),
    sections: document.querySelectorAll('.view-section'),
    backBtn: document.getElementById('header-back-btn'),
    forwardBtn: document.getElementById('header-forward-btn'),
    heroListenBtn: document.getElementById('hero-listen-btn'),
    toastNotif: document.getElementById('toast-notif'),
    
    // Home View
    homeShelves: document.getElementById('home-shelves'),

    // Explore View
    exploreNewReleases: document.getElementById('explore-new-releases'),
    exploreGenres: document.getElementById('explore-genres'),

    // Charts View
    chartsShelves: document.getElementById('charts-shelves'),

    // Search View
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    suggestionsBox: document.getElementById('suggestions-box'),
    searchLoader: document.getElementById('search-loader'),
    searchResultsWrapper: document.getElementById('search-results-wrapper'),
    searchEmptyState: document.getElementById('search-empty-state'),
    topResultBox: document.getElementById('top-result-box'),
    topResultCard: document.getElementById('top-result-card'),
    catSongsBox: document.getElementById('cat-songs-box'),
    catSongsList: document.getElementById('cat-songs-list'),
    catAlbumsBox: document.getElementById('cat-albums-box'),
    catAlbumsGrid: document.getElementById('cat-albums-grid'),
    catArtistsBox: document.getElementById('cat-artists-box'),
    catArtistsGrid: document.getElementById('cat-artists-grid'),
    catPlaylistsBox: document.getElementById('cat-playlists-box'),
    catPlaylistsGrid: document.getElementById('cat-playlists-grid'),

    // Library View
    libTabs: document.querySelectorAll('.lib-tab'),
    libTabContents: document.querySelectorAll('.lib-tab-content'),
    likedSongsList: document.getElementById('liked-songs-list'),
    likedSongsEmpty: document.getElementById('liked-songs-empty'),
    recentSongsList: document.getElementById('recent-songs-list'),
    recentSongsEmpty: document.getElementById('recent-songs-empty'),
    userPlaylistsGrid: document.getElementById('user-playlists-grid'),
    userPlaylistsEmpty: document.getElementById('user-playlists-empty'),

    // Detail View
    detailView: document.getElementById('view-detail'),
    detailBackdrop: document.getElementById('detail-backdrop'),
    detailCoverArt: document.getElementById('detail-cover-art'),
    detailType: document.getElementById('detail-type'),
    detailTitle: document.getElementById('detail-title'),
    detailSubtitle: document.getElementById('detail-subtitle'),
    detailDescription: document.getElementById('detail-description'),
    detailBtnPlay: document.getElementById('detail-btn-play'),
    detailBtnShuffle: document.getElementById('detail-btn-shuffle'),
    detailTracksList: document.getElementById('detail-tracks-list'),
    detailTracksContainer: document.getElementById('detail-tracks-container'),
    detailShelvesContainer: document.getElementById('detail-shelves-container'),

    // Mini Player
    miniPlayer: document.getElementById('mini-player'),
    miniProgress: document.getElementById('mini-progress-bar'),
    miniDetails: document.getElementById('mini-player-details'),
    miniArt: document.getElementById('mini-art'),
    miniTitle: document.getElementById('mini-title'),
    miniArtist: document.getElementById('mini-artist'),
    miniBtnPrev: document.getElementById('mini-btn-prev'),
    miniBtnPlay: document.getElementById('mini-btn-play'),
    miniBtnNext: document.getElementById('mini-btn-next'),
    miniBtnLike: document.getElementById('mini-btn-like'),
    miniBtnExpand: document.getElementById('mini-btn-expand'),

    // Fullscreen Player
    fullscreenPlayer: document.getElementById('fullscreen-player'),
    fsBgArt: document.getElementById('fs-bg-art'),
    fsCircularVisualizer: document.getElementById('fs-circular-visualizer'),
    fsBarsVisualizer: document.getElementById('fs-bars-visualizer'),
    fsCloseBtn: document.getElementById('fs-close-btn'),
    fsBtnLike: document.getElementById('fs-btn-like'),
    fsArt: document.getElementById('fs-art'),
    fsDiscArt: document.getElementById('fs-disc-art'),
    fsGlowRing: document.getElementById('fs-glow-ring'),
    fsTitle: document.getElementById('fs-title'),
    fsArtist: document.getElementById('fs-artist'),
    fsSlider: document.getElementById('fs-slider'),
    fsTimeCurrent: document.getElementById('fs-time-current'),
    fsTimeTotal: document.getElementById('fs-time-total'),
    fsBtnShuffle: document.getElementById('fs-btn-shuffle'),
    fsBtnPrev: document.getElementById('fs-btn-prev'),
    fsBtnPlay: document.getElementById('fs-btn-play'),
    fsBtnNext: document.getElementById('fs-btn-next'),
    fsBtnRepeat: document.getElementById('fs-btn-repeat'),
    fsVolumeIcon: document.getElementById('fs-volume-icon'),
    fsVolumeSlider: document.getElementById('fs-volume-slider'),
    lyricsBody: document.getElementById('lyrics-body'),
    lyricsSyncBadge: document.getElementById('lyrics-sync-badge'),
    fsGenre: document.getElementById('fs-genre-pill'),
    miniBtnSeekBack: document.getElementById('mini-btn-seek-back'),
    miniBtnSeekFwd: document.getElementById('mini-btn-seek-fwd'),
    fsBtnSeekBack: document.getElementById('fs-btn-seek-back'),
    fsBtnSeekFwd: document.getElementById('fs-btn-seek-fwd')
};

// Global Intersection Observer for optimizing pet sprite sheet animations
window.petObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const animator = entry.target.__animator__;
        if (!animator) return;
        if (entry.isIntersecting) {
            animator.isInViewport = true;
            if (animator.shouldBeRunning) {
                animator.startLoop();
            }
        } else {
            animator.isInViewport = false;
            animator.stopLoop();
        }
    });
}, { threshold: 0.05 });

// Global caches for performance optimization
const streamUrlCache = {};
const petImageCache = {};
const petImageCallbacks = {};

function getPetImage(src, onload) {
    if (!src) return null;
    
    if (petImageCache[src]) {
        const img = petImageCache[src];
        if (img.complete && img.naturalWidth > 0) {
            if (onload) setTimeout(() => onload(img), 0);
        } else {
            if (onload) {
                if (!petImageCallbacks[src]) {
                    petImageCallbacks[src] = [];
                }
                petImageCallbacks[src].push(onload);
            }
        }
        return img;
    }
    
    const img = new Image();
    petImageCache[src] = img;
    petImageCallbacks[src] = onload ? [onload] : [];
    
    img.onload = () => {
        const cbs = petImageCallbacks[src] || [];
        delete petImageCallbacks[src];
        cbs.forEach(cb => {
            try { cb(img); } catch(e) { console.error(e); }
        });
    };
    
    img.onerror = () => {
        delete petImageCache[src]; // Clear from cache so we can retry on next request
        const cbs = petImageCallbacks[src] || [];
        delete petImageCallbacks[src];
        cbs.forEach(cb => {
            try { cb(null); } catch(e) { console.error(e); }
        });
    };
    
    img.src = src; // Set src AFTER defining onload/onerror to prevent race conditions
    return img;
}

function prefetchNextTrackStream() {
    if (state.queueIndex === -1 || state.queue.length <= 1) return;
    const nextIndex = (state.queueIndex + 1) % state.queue.length;
    const nextTrack = state.queue[nextIndex];
    if (!nextTrack) return;

    // 1. Prefetch color extraction
    if (nextTrack.thumbnail && state.settings.dynamicTheme && !extractedColorCache[nextTrack.id]) {
        console.log(`Prefetching colors for next track: ${nextTrack.title}`);
        extractColorsFromImage(nextTrack.thumbnail).then(colors => {
            if (colors) {
                extractedColorCache[nextTrack.id] = colors;
                console.log(`Prefetched and cached colors successfully for: ${nextTrack.title}`);
            }
        });
    }

    // 2. Prefetch stream URL
    if (streamUrlCache[nextTrack.id]) return;
    console.log(`Prefetching stream URL for next track: ${nextTrack.title} (${nextTrack.id})`);
    
    fetch(`/api/stream?id=${nextTrack.id}`, { headers: getAuthHeaders() })
        .then(response => {
            if (response.ok) return response.json();
        })
        .then(data => {
            if (data && data.url) {
                streamUrlCache[nextTrack.id] = data.url;
                console.log(`Prefetched stream URL successfully for: ${nextTrack.title}`);
            }
        })
        .catch(err => {
            console.warn("Failed to prefetch next track stream URL:", err);
        });
}

// Auth Headers Retrieval Utility
function getAuthHeaders() {
    const headers = {};
    const cookie = localStorage.getItem('zynic_cookie');
    const visitorData = localStorage.getItem('zynic_visitor_data');
    const datasyncId = localStorage.getItem('zynic_datasync_id');
    
    if (cookie) headers['X-Ytm-Cookie'] = cookie;
    if (visitorData) headers['X-Ytm-Visitor-Data'] = visitorData;
    if (datasyncId) headers['X-Ytm-Datasync-Id'] = datasyncId;
    
    return headers;
}

// Initialize Application
function init() {
    loadSettingsFromStorage();
    updateUserProfile();
    initSquigglySlider();
    initVisualizerCanvases();
    loadLibraryFromStorage();
    setupEventListeners();

    // Live-update theme when OS dark/light preference changes (used by Auto mode)
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (state.settings.themeMode === 'auto') {
                applyThemeSettings();
            }
        });
    }
    
    // Initialize Digital Pet companion
    onPetAppOpened();
    setupPetDragPhysics();
    setupPetActionEventListeners();
    renderPetPicker();
    initializePetAnimators();
    
    // Turntable and sidebar initialization
    initTurntableInteractions();
    initMiniProgressInteractions();
    renderRightSidebarQueue();
    
    // Default initial page loads
    loadHomeFeed();
    updateNavigationButtonsState();
}


// Toast Display helper
function showToast(message, type = 'success') {
    dom.toastNotif.textContent = message;
    dom.toastNotif.className = `toast-notification show ${type}`;
    setTimeout(() => {
        dom.toastNotif.classList.remove('show');
    }, 3000);
}

// Event Binding
function setupEventListeners() {
    // Navigation / Tabs
    dom.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            navigateToTab(targetTab);
        });
    });

    dom.backBtn.addEventListener('click', navigateBack);
    dom.forwardBtn.addEventListener('click', navigateForward);
    dom.heroListenBtn.addEventListener('click', () => navigateToTab('search'));


    // Theme & Settings Customization Modals open/close
    const settingsBtn = document.getElementById('sidebar-settings-btn');
    const quickSettingsBtn = document.getElementById('rs-btn-settings-quick');
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseBtn = document.getElementById('settings-modal-close-btn');
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    
    if ((settingsBtn || quickSettingsBtn) && settingsModal) {
        const openSettings = () => { settingsModal.style.display = 'flex'; };
        if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
        if (quickSettingsBtn) quickSettingsBtn.addEventListener('click', openSettings);
    }

    // Header user badge → open profile modal (used on mobile)
    const headerBadge = document.getElementById('header-user-badge');
    if (headerBadge) headerBadge.addEventListener('click', openProfileModal);
    
    const notificationsBtn = document.getElementById('rs-btn-notifications');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', () => {
            showToast("No new notifications", "info");
        });
    }
    
    if (settingsCloseBtn && settingsModal) {
        settingsCloseBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }
    
    if (settingsSaveBtn && settingsModal) {
        settingsSaveBtn.addEventListener('click', () => {
            const nameInput = document.getElementById('settings-display-name');
            if (nameInput) {
                state.settings.displayName = nameInput.value.trim() || 'Guest';
                saveSettingsToStorage();
                updateUserProfile();
            }
            settingsModal.style.display = 'none';
            showToast("Theme Customizations Applied!");
        });
    }

    const nameInput = document.getElementById('settings-display-name');
    if (nameInput) {
        nameInput.addEventListener('change', (e) => {
            state.settings.displayName = e.target.value.trim() || 'Guest';
            saveSettingsToStorage();
            updateUserProfile();
        });
        nameInput.addEventListener('input', (e) => {
            state.settings.displayName = e.target.value.trim() || 'Guest';
            saveSettingsToStorage();
            updateUserProfile();
        });
    }
    
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.style.display = 'none';
            }
        });
    }
    
    // Theme Mode Click Listeners
    const btnAuto = document.getElementById('theme-btn-auto');
    const btnDark = document.getElementById('theme-btn-dark');
    const btnOled = document.getElementById('theme-btn-pureblack');

    if (btnAuto) btnAuto.addEventListener('click', () => {
        state.settings.themeMode = 'auto';
        saveSettingsToStorage();
        applyThemeSettings();
    });
    if (btnDark) btnDark.addEventListener('click', () => {
        state.settings.themeMode = 'dark';
        saveSettingsToStorage();
        applyThemeSettings();
    });
    if (btnOled) btnOled.addEventListener('click', () => {
        state.settings.themeMode = 'oled';
        saveSettingsToStorage();
        applyThemeSettings();
    });

    
    // Checkbox Listeners
    const dynCheckbox = document.getElementById('settings-dynamic-theme');
    if (dynCheckbox) {
        dynCheckbox.addEventListener('change', (e) => {
            state.settings.dynamicTheme = e.target.checked;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }
    
    const petCheckbox = document.getElementById('settings-show-pet');
    if (petCheckbox) {
        petCheckbox.addEventListener('change', (e) => {
            state.settings.showPet = e.target.checked;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }
    
    // Static Accent Selection Grid dots Click Listeners
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const hex = dot.getAttribute('data-color');
            if (hex) {
                state.settings.accentColor = hex;
                saveSettingsToStorage();
                applyThemeSettings();
            }
        });
    });



    // Search Input listeners
    let debounceTimer;
    dom.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query) {
            dom.searchClearBtn.style.display = 'block';
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchSearchSuggestions(query), 300);
        } else {
            dom.searchClearBtn.style.display = 'none';
            dom.suggestionsBox.style.display = 'none';
        }
    });

    dom.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = dom.searchInput.value.trim();
            if (query) {
                executeSearch(query);
            }
        }
    });

    dom.searchClearBtn.addEventListener('click', () => {
        dom.searchInput.value = '';
        dom.searchClearBtn.style.display = 'none';
        dom.suggestionsBox.style.display = 'none';
        dom.searchInput.focus();
    });

    // Close suggestions box when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== dom.searchInput && e.target !== dom.suggestionsBox) {
            dom.suggestionsBox.style.display = 'none';
        }
    });

    // Library Tabs
    dom.libTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            dom.libTabs.forEach(t => t.classList.remove('active'));
            dom.libTabContents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContentId = `library-${tab.getAttribute('data-lib-tab')}`;
            document.getElementById(targetContentId).classList.add('active');
        });
    });

    // Audio Playback Events
    dom.audio.addEventListener('timeupdate', handleTimeUpdate);
    dom.audio.addEventListener('ended', handleTrackEnded);
    dom.audio.addEventListener('play', () => {
        setPlaybackState(true);
        if (window.applyTurntablePlaybackRate) {
            window.applyTurntablePlaybackRate();
        }
    });
    dom.audio.addEventListener('playing', () => {
        if (window.applyTurntablePlaybackRate) {
            window.applyTurntablePlaybackRate();
        }
    });
    dom.audio.addEventListener('pause', () => setPlaybackState(false));

    // Player Play/Pause bindings
    dom.miniBtnPlay.addEventListener('click', togglePlayPause);
    dom.fsBtnPlay.addEventListener('click', togglePlayPause);

    // Player Next/Prev bindings
    dom.miniBtnPrev.addEventListener('click', playPreviousTrack);
    dom.fsBtnPrev.addEventListener('click', playPreviousTrack);
    dom.miniBtnNext.addEventListener('click', playNextTrack);
    dom.fsBtnNext.addEventListener('click', playNextTrack);

    // Player Seek bindings
    const handleSeekBack = () => {
        if (dom.audio) {
            dom.audio.currentTime = Math.max(0, dom.audio.currentTime - 10);
        }
    };
    const handleSeekFwd = () => {
        if (dom.audio && dom.audio.duration) {
            dom.audio.currentTime = Math.min(dom.audio.duration, dom.audio.currentTime + 10);
        }
    };
    if (dom.miniBtnSeekBack) dom.miniBtnSeekBack.addEventListener('click', handleSeekBack);
    if (dom.fsBtnSeekBack) dom.fsBtnSeekBack.addEventListener('click', handleSeekBack);
    if (dom.miniBtnSeekFwd) dom.miniBtnSeekFwd.addEventListener('click', handleSeekFwd);
    if (dom.fsBtnSeekFwd) dom.fsBtnSeekFwd.addEventListener('click', handleSeekFwd);

    // Playback modifiers
    dom.fsBtnShuffle.addEventListener('click', toggleShuffle);
    dom.fsBtnRepeat.addEventListener('click', toggleRepeat);

    // Progress scrub
    dom.fsSlider.addEventListener('input', (e) => {
        if (dom.audio.duration) {
            const pct = parseFloat(e.target.value);
            const time = (pct / 100) * dom.audio.duration;
            dom.fsTimeCurrent.textContent = formatTime(time);
        }
    });
    dom.fsSlider.addEventListener('change', (e) => {
        if (dom.audio.duration) {
            const pct = parseFloat(e.target.value);
            dom.audio.currentTime = (pct / 100) * dom.audio.duration;
        }
    });

    // Like system
    dom.miniBtnLike.addEventListener('click', () => toggleLikeTrack(state.currentTrack));
    dom.fsBtnLike.addEventListener('click', () => toggleLikeTrack(state.currentTrack));

    // Fullscreen view triggers
    dom.miniDetails.addEventListener('click', openFullscreenPlayer);
    dom.miniBtnExpand.addEventListener('click', openFullscreenPlayer);
    dom.fsCloseBtn.addEventListener('click', closeFullscreenPlayer);

    // Volume controllers
    dom.fsVolumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value) / 100;
        state.volume = val;
        dom.audio.volume = val;
        updateVolumeIcon(val);
    });

    dom.fsVolumeIcon.addEventListener('click', toggleMute);
    
    // ---- Player Theme Dropdown ----
    const playerThemeSel = document.getElementById('settings-player-theme');
    if (playerThemeSel) {
        playerThemeSel.addEventListener('change', (e) => {
            state.settings.playerTheme = e.target.value;
            saveSettingsToStorage();
            applyPlayerTheme(e.target.value);
            showToast(`Player theme set to ${playerThemeSel.options[playerThemeSel.selectedIndex].text.split('(')[0].trim()}`);
        });
    }
    
    // ---- Lyrics Animation Style Dropdown ----
    const lyricsStyleSel = document.getElementById('settings-lyrics-style');
    if (lyricsStyleSel) {
        lyricsStyleSel.addEventListener('change', (e) => {
            state.settings.lyricsStyle = e.target.value;
            saveSettingsToStorage();
            applyLyricsStyle(e.target.value);
            showToast(`Lyrics style updated!`);
        });
    }
    
    // ---- Custom Pet Creator Modal ----
    const customPetModal = document.getElementById('custom-pet-modal');
    const pickerCustomBtn = document.getElementById('picker-btn-custom-import');
    const customPetCloseBtn = document.getElementById('custom-pet-modal-close-btn');
    const customPetCancelBtn = document.getElementById('custom-pet-cancel-btn');
    const customPetSaveBtn = document.getElementById('custom-pet-save-btn');
    
    if (pickerCustomBtn && customPetModal) {
        pickerCustomBtn.addEventListener('click', () => {
            // Reset form fields
            document.getElementById('custom-pet-name-input').value = '';
            document.getElementById('custom-pet-desc-input').value = '';
            document.getElementById('custom-pet-sprite-input').value = '';
            document.getElementById('custom-pet-genres-input').value = '';
            customPetModal.style.display = 'flex';
        });
    }
    
    [customPetCloseBtn, customPetCancelBtn].forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            if (customPetModal) customPetModal.style.display = 'none';
        });
    });
    
    if (customPetModal) {
        customPetModal.addEventListener('click', (e) => {
            if (e.target === customPetModal) customPetModal.style.display = 'none';
        });
    }
    
    if (customPetSaveBtn) {
        customPetSaveBtn.addEventListener('click', saveCustomPet);
    }
    
    // ---- Petdex Gallery Category Filter Tabs ----
    const petFilterTabs = document.querySelectorAll('#view-pet-picker .lib-tab');
    petFilterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            petFilterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderPetPicker(tab.getAttribute('data-filter') || 'all');
        });
    });

    const squigglyCheckbox = document.getElementById('settings-squiggly-slider');
    if (squigglyCheckbox) {
        squigglyCheckbox.addEventListener('change', (e) => {
            state.settings.squigglySlider = e.target.checked;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }
    
    const hideThumbCheckbox = document.getElementById('settings-hide-thumbnail');
    if (hideThumbCheckbox) {
        hideThumbCheckbox.addEventListener('change', (e) => {
            state.settings.hidePlayerThumbnail = e.target.checked;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }

    const miniBgSel = document.getElementById('settings-mini-bg');
    if (miniBgSel) {
        miniBgSel.addEventListener('change', (e) => {
            state.settings.miniPlayerBgStyle = e.target.value;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }

    const buttonsStyleSel = document.getElementById('settings-buttons-style');
    if (buttonsStyleSel) {
        buttonsStyleSel.addEventListener('change', (e) => {
            state.settings.playerButtonsStyle = e.target.value;
            saveSettingsToStorage();
            applyThemeSettings();
        });
    }

    const petSearchInput = document.getElementById('pet-gallery-search-input');
    if (petSearchInput) {
        petSearchInput.addEventListener('input', () => {
            renderPetPicker('petdex');
        });
    }

    // ---- Custom Playlists Modals & Actions ----
    const createPlModal = document.getElementById('create-playlist-modal');
    const createPlCloseBtn = document.getElementById('create-playlist-close-btn');
    const btnCancelCreatePl = document.getElementById('btn-cancel-create-playlist');
    const btnSaveCreatedPl = document.getElementById('btn-save-created-playlist');
    const addPlModal = document.getElementById('add-to-playlist-modal');
    const addPlCloseBtn = document.getElementById('add-to-playlist-close-btn');
    const addPlBtnNew = document.getElementById('add-to-playlist-btn-new');
    
    // Open create playlist modal
    const openCreatePlaylist = () => {
        document.getElementById('playlist-name-input').value = '';
        document.getElementById('playlist-desc-input').value = '';
        if (createPlModal) createPlModal.style.display = 'flex';
    };

    const libCreateBtn = document.getElementById('lib-btn-create-playlist');
    const libCreateBtnEmpty = document.getElementById('lib-btn-create-playlist-empty');
    if (libCreateBtn) libCreateBtn.addEventListener('click', openCreatePlaylist);
    if (libCreateBtnEmpty) libCreateBtnEmpty.addEventListener('click', openCreatePlaylist);

    // Close create playlist modal
    [createPlCloseBtn, btnCancelCreatePl].forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            if (createPlModal) createPlModal.style.display = 'none';
        });
    });
    if (createPlModal) {
        createPlModal.addEventListener('click', (e) => {
            if (e.target === createPlModal) createPlModal.style.display = 'none';
        });
    }

    // Save playlist
    if (btnSaveCreatedPl) {
        btnSaveCreatedPl.addEventListener('click', () => {
            const name = document.getElementById('playlist-name-input').value.trim();
            const desc = document.getElementById('playlist-desc-input').value.trim();
            if (!name) {
                showToast("Playlist name cannot be empty", "error");
                return;
            }
            createPlaylist(name, desc);
            if (createPlModal) createPlModal.style.display = 'none';
        });
    }

    // Close add-to-playlist modal
    if (addPlCloseBtn) {
        addPlCloseBtn.addEventListener('click', () => {
            if (addPlModal) addPlModal.style.display = 'none';
        });
    }
    if (addPlModal) {
        addPlModal.addEventListener('click', (e) => {
            if (e.target === addPlModal) addPlModal.style.display = 'none';
        });
    }

    // New playlist from add-to-playlist modal
    if (addPlBtnNew) {
        addPlBtnNew.addEventListener('click', () => {
            if (addPlModal) addPlModal.style.display = 'none';
            openCreatePlaylist();
        });
    }
}

// -------------------------------------------------------------
// Navigation Router Controller
// -------------------------------------------------------------
function navigateToTab(tabName, skipHistory = false) {
    if (state.currentTab === tabName && !tabName.startsWith('detail::')) return;

    // Manage tab selection visual highlights
    dom.navItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Manage view sections visibility
    dom.sections.forEach(section => {
        if (section.id === `view-${tabName}`) {
            section.classList.add('active');
        } else {
            section.classList.remove('active');
        }
    });

    // Toggle detail view visibility specifically
    if (tabName.startsWith('detail::')) {
        dom.detailView.classList.add('active');
        const id = tabName.replace('detail::', '');
        loadBrowseDetails(id);
    } else {
        dom.detailView.classList.remove('active');
    }

    state.currentTab = tabName;

    // Track navigation history
    if (!skipHistory && state.history[state.historyIndex] !== tabName) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(tabName);
        state.historyIndex = state.history.length - 1;
    }

    updateNavigationButtonsState();

    // Call dynamic loaders as needed
    if (tabName === 'home') loadHomeFeed();
    else if (tabName === 'explore') loadExploreFeed();
    else if (tabName === 'charts') loadChartsFeed();
    else if (tabName === 'library') renderLibrary();
    else if (tabName === 'pet-den') updatePetDenUI();
    else if (tabName === 'pet-picker') renderPetPicker();
    else if (tabName === 'equalizer') initEqualizerEngine();
    else if (tabName === 'stats') renderStatsDashboard();
    else if (tabName === 'recognition') initSongFinderUI();
}

function navigateBack() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        const tab = state.history[state.historyIndex];
        navigateToTab(tab, true);
    }
}

function navigateForward() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        const tab = state.history[state.historyIndex];
        navigateToTab(tab, true);
    }
}

function updateNavigationButtonsState() {
    dom.backBtn.disabled = state.historyIndex === 0;
    dom.forwardBtn.disabled = state.historyIndex === state.history.length - 1;
}

// -------------------------------------------------------------
// Dynamic Content Loaders (YTM API Proxy Gateway)
// -------------------------------------------------------------

// Render helper for home feed
function renderHomeFeed(data) {
    dom.homeShelves.innerHTML = '';
    const fragment = document.createDocumentFragment();

    // 1. Recently Played Shelf (up to 10 tracks)
    if (state.recentTracks && state.recentTracks.length > 0) {
        const section = document.createElement('div');
        section.className = 'shelf-section';
        
        const title = document.createElement('h2');
        title.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="margin-right: 8px; opacity: 0.7;"></i>Recently Played`;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'music-row-list';
        
        const recentSlice = state.recentTracks.slice(0, 10);
        recentSlice.forEach((track, index) => {
            const row = createMusicRow(track, index + 1, recentSlice);
            grid.appendChild(row);
        });
        
        section.appendChild(grid);
        fragment.appendChild(section);
    }

    // 2. For You Recommendations Shelf (up to 10 tracks)
    if (state.cache.recommendations && state.cache.recommendations.length > 0) {
        const section = document.createElement('div');
        section.className = 'shelf-section';
        
        const title = document.createElement('h2');
        title.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 8px; opacity: 0.7;"></i>For You`;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'music-row-list';
        
        state.cache.recommendations.forEach((track, index) => {
            const row = createMusicRow(track, index + 1, state.cache.recommendations);
            grid.appendChild(row);
        });
        
        section.appendChild(grid);
        fragment.appendChild(section);
    }

    // 3. API-provided shelves
    if (data.shelves && data.shelves.length > 0) {
        data.shelves.forEach(shelf => {
            const section = document.createElement('div');
            section.className = 'shelf-section';
            
            const title = document.createElement('h2');
            title.textContent = shelf.title;
            section.appendChild(title);

            const grid = document.createElement('div');
            // Determine whether to render as grid (albums/playlists) or lists (songs)
            const isSongsRow = shelf.items.every(item => item.type === 'song');
            if (isSongsRow) {
                grid.className = 'music-row-list';
                shelf.items.forEach((item, index) => {
                    const row = createMusicRow(item, index + 1, shelf.items);
                    grid.appendChild(row);
                });
            } else {
                grid.className = 'music-grid';
                shelf.items.forEach(item => {
                    const card = createMusicCard(item);
                    grid.appendChild(card);
                });
            }

            section.appendChild(grid);
            fragment.appendChild(section);
        });
    }

    if (fragment.childNodes.length > 0) {
        dom.homeShelves.appendChild(fragment);
    } else {
        dom.homeShelves.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-music"></i>
                <h3>Could Not Load Home Feed</h3>
                <p>Try refreshing or checking your connection.</p>
            </div>
        `;
    }
}

async function loadRecommendationsAsync() {
    const pool = [];
    const seenArtists = new Set();
    const seenGenres = new Set();
    
    const allTracks = [...state.recentTracks, ...state.likedTracks];
    
    allTracks.forEach(track => {
        const artist = track.artist || track.subtitle;
        if (artist && artist !== 'Unknown Artist') {
            const cleanArtist = artist.trim();
            if (cleanArtist && !seenArtists.has(cleanArtist.toLowerCase())) {
                seenArtists.add(cleanArtist.toLowerCase());
                pool.push({ type: 'artist', name: cleanArtist });
            }
        }
        
        const genre = detectGenre(track.title, track.artist || track.subtitle);
        if (genre && genre !== 'other' && !seenGenres.has(genre)) {
            seenGenres.add(genre);
            pool.push({ type: 'genre', name: genre });
        }
    });
    
    let seedQuery = "";
    if (pool.length > 0) {
        const selected = pool[Math.floor(Math.random() * pool.length)];
        seedQuery = selected.name;
    } else {
        const fallbacks = ['lofi chill', 'acoustic pop', 'trending hits', 'synthwave', 'dance hits'];
        seedQuery = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
    
    console.log(`Generating For You recommendations based on seed: "${seedQuery}"`);
    
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(seedQuery)}`, { headers: getAuthHeaders() });
        if (!response.ok) throw new Error("Search failed");
        
        const data = await response.json();
        const results = data.results || [];
        
        const playedIds = new Set(allTracks.map(t => t.id));
        let recommendedSongs = results.filter(item => item.type === 'song' && !playedIds.has(item.id));
        
        if (recommendedSongs.length === 0) {
            recommendedSongs = results.filter(item => item.type === 'song');
        }
        
        const shuffled = recommendedSongs.sort(() => Math.random() - 0.5).slice(0, 10);
        state.cache.recommendations = shuffled;
        return shuffled;
    } catch (e) {
        console.error("Failed to load recommendations:", e);
        return [];
    }
}

async function getOrFetchRecommendations(force = false) {
    if (!force && state.cache.recommendations) {
        return state.cache.recommendations;
    }
    return await loadRecommendationsAsync();
}

async function loadHomeFeed(force = false) {
    if (force) {
        state.cache.recommendations = null;
    }
    if (!force && isCacheValid(state.cache.homeTime)) {
        renderHomeFeed(state.cache.home);
        return;
    }

    dom.homeShelves.innerHTML = `
        <div class="shelf-placeholder">
            <div class="skeleton-title"></div>
            <div class="music-grid">
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
                <div class="skeleton-card"></div>
            </div>
        </div>
    `;

    try {
        const homePromise = fetch('/api/home', { headers: getAuthHeaders() }).then(r => r.json());
        const recsPromise = getOrFetchRecommendations(force);
        
        const [homeData, recsData] = await Promise.all([
            homePromise,
            recsPromise.catch(e => {
                console.error("Failed to load recommendations:", e);
                return [];
            })
        ]);
        
        state.cache.home = homeData;
        state.cache.homeTime = Date.now();
        renderHomeFeed(homeData);
    } catch (e) {
        console.error("Home feed failure:", e);
        dom.homeShelves.innerHTML = `<div class="empty-state"><h3>Failed to load home feed.</h3></div>`;
    }
}

// Render helper for explore feed
function renderExploreFeed(data) {
    // New releases
    dom.exploreNewReleases.innerHTML = '';
    if (data.newReleases && data.newReleases.length > 0) {
        const fragment = document.createDocumentFragment();
        data.newReleases.forEach(item => {
            const card = createMusicCard(item);
            fragment.appendChild(card);
        });
        dom.exploreNewReleases.appendChild(fragment);
    }

    // Genres
    dom.exploreGenres.innerHTML = '';
    if (data.moodsAndGenres && data.moodsAndGenres.length > 0) {
        const fragment = document.createDocumentFragment();
        data.moodsAndGenres.forEach(genre => {
            const btn = document.createElement('button');
            btn.className = 'genre-btn';
            btn.innerHTML = `<i class="fa-solid fa-tags"></i> ${genre.title}`;
            btn.onclick = () => {
                navigateToTab(`detail::${genre.id}`);
            };
            fragment.appendChild(btn);
        });
        dom.exploreGenres.appendChild(fragment);
    }
}

async function loadExploreFeed(force = false) {
    if (!force && isCacheValid(state.cache.exploreTime)) {
        renderExploreFeed(state.cache.explore);
        return;
    }

    dom.exploreNewReleases.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div><div class="skeleton-card"></div>';
    dom.exploreGenres.innerHTML = '<div class="genre-btn skeleton"></div>';

    try {
        const response = await fetch('/api/explore', { headers: getAuthHeaders() });
        const data = await response.json();

        state.cache.explore = data;
        state.cache.exploreTime = Date.now();
        renderExploreFeed(data);
    } catch (e) {
        console.error("Explore load failed:", e);
    }
}

// Render helper for charts feed
function renderChartsFeed(data) {
    dom.chartsShelves.innerHTML = '';
    if (data.charts && data.charts.length > 0) {
        const fragment = document.createDocumentFragment();
        data.charts.forEach(chart => {
            const section = document.createElement('div');
            section.className = 'shelf-section';

            const title = document.createElement('h2');
            title.textContent = chart.title;
            section.appendChild(title);

            const grid = document.createElement('div');
            const isSongs = chart.items.every(item => item.type === 'song');
            if (isSongs) {
                grid.className = 'music-row-list';
                chart.items.forEach((item, index) => {
                    const row = createMusicRow(item, index + 1, chart.items);
                    grid.appendChild(row);
                });
            } else {
                grid.className = 'music-grid';
                chart.items.forEach(item => {
                    const card = createMusicCard(item);
                    grid.appendChild(card);
                });
            }

            section.appendChild(grid);
            fragment.appendChild(section);
        });
        dom.chartsShelves.appendChild(fragment);
    }
}

async function loadChartsFeed(force = false) {
    if (!force && isCacheValid(state.cache.chartsTime)) {
        renderChartsFeed(state.cache.charts);
        return;
    }

    dom.chartsShelves.innerHTML = '<div class="shelf-placeholder"><div class="skeleton-title"></div></div>';

    try {
        const response = await fetch('/api/charts', { headers: getAuthHeaders() });
        const data = await response.json();

        state.cache.charts = data;
        state.cache.chartsTime = Date.now();
        renderChartsFeed(data);
    } catch (e) {
        console.error("Charts load failed:", e);
    }
}

// -------------------------------------------------------------
// Detail Page Builder (Playlist, Album, Artist views)
// -------------------------------------------------------------
function renderBrowseDetails(data, id) {
    const coverUrl = data.thumbnail || getTrackThumbnail(data, 400);
    dom.detailCoverArt.src = coverUrl;
    dom.detailBackdrop.style.backgroundImage = `url('${coverUrl}')`;
    dom.detailTitle.textContent = data.title || 'Unknown Title';
    
    let typeStr = "PLAYLIST";
    if (id.startsWith("MPREb_")) typeStr = "ALBUM";
    else if (id.startsWith("UC")) typeStr = "ARTIST";
    dom.detailType.textContent = typeStr;

    dom.detailSubtitle.textContent = data.subtitle || '';
    dom.detailDescription.textContent = data.description || '';

    // Check if artist view or playlist/album tracks list
    if (typeStr === "ARTIST") {
        dom.detailTracksContainer.style.display = 'none';
        dom.detailShelvesContainer.style.display = 'block';
        dom.detailShelvesContainer.innerHTML = '';

        const artistSongs = [];
        if (data.sections && data.sections.length > 0) {
            const fragment = document.createDocumentFragment();
            data.sections.forEach(sec => {
                const section = document.createElement('div');
                section.className = 'shelf-section';
                
                const title = document.createElement('h2');
                title.textContent = sec.title;
                section.appendChild(title);

                const grid = document.createElement('div');
                const isSongs = sec.items && sec.items.every(item => item.type === 'song');
                if (isSongs) {
                    grid.className = 'music-row-list';
                    sec.items.forEach((item, index) => {
                        const row = createMusicRow(item, index + 1, sec.items);
                        grid.appendChild(row);
                        if (item.id) artistSongs.push(item);
                    });
                } else {
                    grid.className = 'music-grid';
                    sec.items.forEach(item => {
                        const card = createMusicCard(item);
                        grid.appendChild(card);
                    });
                }

                section.appendChild(grid);
                fragment.appendChild(section);
            });
            dom.detailShelvesContainer.appendChild(fragment);
        } else {
            dom.detailShelvesContainer.innerHTML = '<p class="empty-text">No content found for this artist.</p>';
        }

        // Attach actions for Artist page
        if (artistSongs.length > 0) {
            dom.detailBtnPlay.style.display = 'inline-flex';
            dom.detailBtnShuffle.style.display = 'inline-flex';
            
            dom.detailBtnPlay.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                playTrack(artistSongs[0], artistSongs);
            };
            
            dom.detailBtnShuffle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const randomIdx = Math.floor(Math.random() * artistSongs.length);
                playTrack(artistSongs[randomIdx], artistSongs);
                if (!state.isShuffled) {
                    toggleShuffle();
                }
            };
        } else {
            dom.detailBtnPlay.style.display = 'none';
            dom.detailBtnShuffle.style.display = 'none';
        }
    } else {
        // Render tracks row lists
        dom.detailTracksList.innerHTML = '';
        const tracks = data.tracks || [];
        if (tracks.length > 0) {
            dom.detailBtnPlay.style.display = 'inline-flex';
            dom.detailBtnShuffle.style.display = 'inline-flex';

            const fragment = document.createDocumentFragment();
            tracks.forEach((track, index) => {
                const row = createMusicRow(track, index + 1, tracks);
                fragment.appendChild(row);
            });
            dom.detailTracksList.appendChild(fragment);

            // Attach actions
            dom.detailBtnPlay.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                playTrack(tracks[0], tracks);
            };
            
            dom.detailBtnShuffle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const randomIdx = Math.floor(Math.random() * tracks.length);
                playTrack(tracks[randomIdx], tracks);
                if (!state.isShuffled) {
                    toggleShuffle();
                }
            };
        } else {
            dom.detailTracksList.innerHTML = '<div class="empty-state">No songs found in this tracklist.</div>';
            dom.detailBtnPlay.style.display = 'none';
            dom.detailBtnShuffle.style.display = 'none';
        }
    }
}

async function loadBrowseDetails(id, force = false) {
    if (id && id.startsWith('user_pl_')) {
        // Reset view
        dom.detailCoverArt.src = '';
        dom.detailBackdrop.style.backgroundImage = 'none';
        dom.detailTitle.textContent = 'Loading...';
        dom.detailSubtitle.textContent = '';
        dom.detailDescription.textContent = '';
        dom.detailTracksList.innerHTML = '<div class="loader" style="margin: 30px auto;"></div>';
        dom.detailShelvesContainer.innerHTML = '';
        dom.detailShelvesContainer.style.display = 'none';
        dom.detailTracksContainer.style.display = 'block';
        dom.detailBtnPlay.style.display = 'none';
        dom.detailBtnShuffle.style.display = 'none';
        dom.detailBtnPlay.onclick = null;
        dom.detailBtnShuffle.onclick = null;

        const pl = state.userPlaylists.find(p => p.id === id);
        if (!pl) {
            dom.detailTracksList.innerHTML = '<div class="empty-state">Playlist not found.</div>';
            return;
        }

        const data = {
            id: pl.id,
            title: pl.title,
            description: pl.description || 'Custom playlist created by you.',
            thumbnail: pl.thumbnail || (pl.tracks.length > 0 ? pl.tracks[0].thumbnail : ''),
            subtitle: `Custom Playlist • ${pl.tracks.length} song${pl.tracks.length === 1 ? '' : 's'}`,
            tracks: pl.tracks
        };

        renderBrowseDetails(data, id);
        return;
    }

    if (!force && state.cache.details[id] && isCacheValid(state.cache.details[id].time)) {
        renderBrowseDetails(state.cache.details[id].data, id);
        return;
    }

    // Reset view
    dom.detailCoverArt.src = '';
    dom.detailBackdrop.style.backgroundImage = 'none';
    dom.detailTitle.textContent = 'Loading...';
    dom.detailSubtitle.textContent = '';
    dom.detailDescription.textContent = '';
    dom.detailTracksList.innerHTML = '<div class="loader" style="margin: 30px auto;"></div>';
    dom.detailShelvesContainer.innerHTML = '';
    dom.detailShelvesContainer.style.display = 'none';
    dom.detailTracksContainer.style.display = 'block';
    dom.detailBtnPlay.style.display = 'none';
    dom.detailBtnShuffle.style.display = 'none';
    dom.detailBtnPlay.onclick = null;
    dom.detailBtnShuffle.onclick = null;

    try {
        const response = await fetch(`/api/browse?id=${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
        const data = await response.json();

        // Save in cache
        state.cache.details[id] = {
            data: data,
            time: Date.now()
        };

        renderBrowseDetails(data, id);
    } catch (e) {
        console.error("Browse detail retrieval failure:", e);
        dom.detailTracksList.innerHTML = '<div class="empty-state">Failed to load details.</div>';
    }
}

// -------------------------------------------------------------
// Component Render Templates
// -------------------------------------------------------------
function createMusicCard(track) {
    const card = document.createElement('div');
    card.className = 'music-card';
    
    // Cover artwork url fallback
    const coverUrl = track.thumbnail || getTrackThumbnail(track, 300);
    
    card.innerHTML = `
        <div class="card-art-wrapper">
            <img src="${coverUrl}" alt="${track.title}" class="card-art" loading="lazy" onerror="handleImageError(this, '${track.id}', 300)">
            <button class="play-hover-btn"><i class="fa-solid fa-play"></i></button>
        </div>
        <div class="card-title" title="${track.title}">${track.title}</div>
        <div class="card-subtitle" title="${track.subtitle || track.artist}">${track.subtitle || track.artist || ''}</div>
    `;

    // Click handles playing or detail navigation based on entity type
    card.addEventListener('click', (e) => {
        if (e.target.closest('.play-hover-btn')) {
            e.stopPropagation();
            if (track.type === 'song') {
                playTrack(track, [track]);
            } else {
                navigateToTab(`detail::${track.id}`);
            }
            return;
        }
        
        if (track.type === 'song') {
            playTrack(track, [track]);
        } else {
            navigateToTab(`detail::${track.id}`);
        }
    });

    return card;
}

function createMusicRow(track, index, playQueueContext) {
    const row = document.createElement('div');
    row.className = 'music-row-item';
    if (state.currentTrack && state.currentTrack.id === track.id) {
        row.classList.add('playing');
    }
    
    const isLiked = isTrackLiked(track.id);
    const likeClass = isLiked ? 'row-btn liked' : 'row-btn';
    const likeIcon = isLiked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
    const coverUrl = track.thumbnail || getTrackThumbnail(track, 150);

    // Show delete button instead of Add/Like if in custom playlist view
    const isCustomPlaylist = state.currentTab && state.currentTab.startsWith('detail::user_pl_');
    
    let actionButtons = `
        <button class="${likeClass} btn-like-row" title="Like"><i class="${likeIcon}"></i></button>
        <button class="row-btn btn-add-to-playlist-row" title="Add to Playlist"><i class="fa-solid fa-plus"></i></button>
    `;
    
    if (isCustomPlaylist) {
        actionButtons = `
            <button class="row-btn btn-remove-from-playlist-row" title="Remove from Playlist" style="color: var(--text-secondary);"><i class="fa-solid fa-trash-can"></i></button>
        `;
    }

    row.innerHTML = `
        <span class="row-index">${index}</span>
        <img src="${coverUrl}" class="row-art" alt="${track.title}" loading="lazy" onerror="handleImageError(this, '${track.id}', 150)">
        <div class="row-details">
            <div class="row-title" title="${track.title}">${track.title}</div>
            <div class="row-subtitle" title="${track.artist || track.subtitle}">${track.artist || track.subtitle || ''}</div>
        </div>
        <div class="row-actions">
            <span class="row-time">${track.duration || '3:30'}</span>
            ${actionButtons}
        </div>
    `;

    row.addEventListener('click', (e) => {
        if (e.target.closest('.btn-like-row') || e.target.closest('.btn-like-row i')) {
            e.stopPropagation();
            toggleLikeTrack(track);
            // Refresh row like visual
            const btn = row.querySelector('.btn-like-row');
            if (btn) {
                const icon = btn.querySelector('i');
                const liked = isTrackLiked(track.id);
                btn.className = liked ? 'row-btn liked' : 'row-btn';
                if (icon) icon.className = liked ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            }
            return;
        }
        
        if (e.target.closest('.btn-add-to-playlist-row') || e.target.closest('.btn-add-to-playlist-row i')) {
            e.stopPropagation();
            openAddToPlaylistModal(track);
            return;
        }
        
        if (e.target.closest('.btn-remove-from-playlist-row') || e.target.closest('.btn-remove-from-playlist-row i')) {
            e.stopPropagation();
            const playlistId = state.currentTab.replace('detail::', '');
            removeTrackFromPlaylist(playlistId, track.id);
            return;
        }
        
        // If the item has browseId/playlistId, navigate to details instead
        if (track.type === 'album' || track.type === 'artist' || track.type === 'playlist') {
            navigateToTab(`detail::${track.id}`);
        } else {
            playTrack(track, playQueueContext);
        }
    });

    return row;
}

// -------------------------------------------------------------
// Search Engine logic
// -------------------------------------------------------------
async function fetchSearchSuggestions(query) {
    if (!query) return;
    try {
        const response = await fetch(`/api/suggestions?q=${encodeURIComponent(query)}`, { headers: getAuthHeaders() });
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            dom.suggestionsBox.innerHTML = '';
            data.suggestions.forEach(text => {
                const item = document.createElement('div');
                item.className = 'suggestion-item';
                item.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <span>${text}</span>`;
                item.addEventListener('click', () => {
                    dom.searchInput.value = text;
                    dom.suggestionsBox.style.display = 'none';
                    executeSearch(text);
                });
                dom.suggestionsBox.appendChild(item);
            });
            dom.suggestionsBox.style.display = 'block';
        } else {
            dom.suggestionsBox.style.display = 'none';
        }
    } catch (e) {
        console.error("Error loading suggestions:", e);
    }
}

async function executeSearch(query) {
    if (!query) return;
    dom.suggestionsBox.style.display = 'none';
    dom.searchEmptyState.style.display = 'none';
    dom.searchResultsWrapper.style.display = 'none';
    dom.searchLoader.style.display = 'flex';

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { headers: getAuthHeaders() });
        const data = await response.json();
        renderSearchResults(data.results);
    } catch (e) {
        console.error("Search failed:", e);
        dom.searchLoader.style.display = 'none';
        dom.searchEmptyState.innerHTML = `
            <i class="fa-solid fa-circle-exclamation" style="color:red;"></i>
            <h3>Search Failed</h3>
            <p>Could not load results. Please check your network or server connection.</p>
        `;
        dom.searchEmptyState.style.display = 'flex';
    }
}

function renderSearchResults(results) {
    dom.searchLoader.style.display = 'none';
    
    if (!results || results.length === 0) {
        dom.searchEmptyState.innerHTML = `
            <i class="fa-solid fa-magnifying-glass"></i>
            <h3>No Results Found</h3>
            <p>Try searching for different terms or spelling.</p>
        `;
        dom.searchEmptyState.style.display = 'flex';
        return;
    }

    // Clear containers
    dom.topResultBox.style.display = 'none';
    dom.topResultCard.innerHTML = '';
    
    dom.catSongsList.innerHTML = '';
    dom.catSongsBox.style.display = 'none';
    
    dom.catAlbumsGrid.innerHTML = '';
    dom.catAlbumsBox.style.display = 'none';

    dom.catArtistsGrid.innerHTML = '';
    dom.catArtistsBox.style.display = 'none';

    dom.catPlaylistsGrid.innerHTML = '';
    dom.catPlaylistsBox.style.display = 'none';

    // Separate track list for play context
    const songsQueue = results.filter(r => r.type === 'song');

    // Populate categories
    let topResult = results.find(r => r.isTopResult);
    if (topResult) {
        dom.topResultBox.style.display = 'block';
        dom.topResultCard.innerHTML = `
            <img src="${topResult.thumbnail || getTrackThumbnail(topResult, 300)}" class="top-art" alt="${topResult.title}" onerror="handleImageError(this, '${topResult.id}', 300)">
            <div class="top-info">
                <span class="top-type">${topResult.type.toUpperCase()}</span>
                <div class="top-title">${topResult.title}</div>
                <div class="top-subtitle">${topResult.subtitle || ''}</div>
            </div>
            <button class="play-hover-btn" style="opacity: 1; transform: none; position: relative;"><i class="fa-solid fa-play"></i></button>
        `;
        dom.topResultCard.onclick = () => {
            if (topResult.type === 'song') {
                playTrack(topResult, [topResult]);
            } else {
                navigateToTab(`detail::${topResult.id}`);
            }
        };
    }

    let songIndex = 1;
    const songsFragment = document.createDocumentFragment();
    const albumsFragment = document.createDocumentFragment();
    const artistsFragment = document.createDocumentFragment();
    const playlistsFragment = document.createDocumentFragment();

    results.forEach(item => {
        if (item.isTopResult) return;

        if (item.type === 'song') {
            dom.catSongsBox.style.display = 'block';
            const row = createMusicRow(item, songIndex++, songsQueue);
            songsFragment.appendChild(row);
        } else if (item.type === 'album') {
            dom.catAlbumsBox.style.display = 'block';
            const card = createMusicCard(item);
            albumsFragment.appendChild(card);
        } else if (item.type === 'artist') {
            dom.catArtistsBox.style.display = 'block';
            const card = createMusicCard(item);
            artistsFragment.appendChild(card);
        } else if (item.type === 'playlist') {
            dom.catPlaylistsBox.style.display = 'block';
            const card = createMusicCard(item);
            playlistsFragment.appendChild(card);
        }
    });

    dom.catSongsList.appendChild(songsFragment);
    dom.catAlbumsGrid.appendChild(albumsFragment);
    dom.catArtistsGrid.appendChild(artistsFragment);
    dom.catPlaylistsGrid.appendChild(playlistsFragment);

    dom.searchResultsWrapper.style.display = 'block';
}

// -------------------------------------------------------------
// Playback Engine & Streaming logic
// -------------------------------------------------------------
let playAbortController = null;

async function playTrack(track, queueList = []) {
    if (!track.id) return;
    
    // Abort any ongoing stream URL fetches
    if (playAbortController) {
        playAbortController.abort();
    }
    playAbortController = new AbortController();
    const currentSignal = playAbortController.signal;
    
    // Set track
    state.currentTrack = track;
    
    // Setup queue context
    if (queueList.length > 0) {
        state.queue = [...queueList];
        state.originalQueue = [...queueList];
        state.queueIndex = state.queue.findIndex(t => t.id === track.id);
        if (state.queueIndex === -1) {
            state.queue.push(track);
            state.queueIndex = state.queue.length - 1;
        }
    } else {
        state.queue = [track];
        state.originalQueue = [track];
        state.queueIndex = 0;
    }

    // Add to history list
    addToRecentHistory(track);
    trackStatsOnPlay(track);

    // Update player views immediately (loading state)
    updatePlayerUI(track, true);
    
    // Show mini player
    dom.miniPlayer.style.display = 'flex';

    // Pause audio
    dom.audio.pause();
    dom.audio.src = '';
    
    try {
        console.log(`Streaming track: ${track.title} (${track.id})`);
        
        let streamUrl = streamUrlCache[track.id];
        if (!streamUrl) {
            const response = await fetch(`/api/stream?id=${track.id}`, { 
                headers: getAuthHeaders(),
                signal: currentSignal
            });
            if (!response.ok) {
                throw new Error(`Failed to load stream link: ${response.statusText}`);
            }
            const data = await response.json();
            streamUrl = data.url;
            streamUrlCache[track.id] = streamUrl;
        }
        
        // Check if superseded before injecting src
        if (currentSignal.aborted) {
            return;
        }
        
        // Inject streaming URL
        dom.audio.src = streamUrl;
        dom.audio.volume = state.volume;
        
        // Load & Play
        await dom.audio.play();
        setPlaybackState(true);

        // Render completed loading state
        updatePlayerUI(track, false);

        // Trigger dynamic lyrics search async
        fetchLyrics(track.title, track.artist || track.subtitle);

        // Prefetch next track stream URL & colors
        prefetchNextTrackStream();

    } catch (e) {
        if (e.name === 'AbortError') {
            console.log(`Playback fetch aborted for track: ${track.title}`);
            return;
        }
        console.error("Playback streaming error:", e);
        showToast(`Error playing ${track.title}. Playing next.`, "error");
        playNextTrack();
    }
}

function updatePlayerUI(track, isLoading = false) {
    const title = isLoading ? `Loading: ${track.title}...` : track.title;
    const artistName = track.artist || track.subtitle || 'Unknown Artist';
    
    // Mini player update
    dom.miniArt.src = track.thumbnail || getTrackThumbnail(track, 150);
    dom.miniTitle.textContent = title;
    dom.miniArtist.textContent = artistName;
    
    // Update mini like indicator
    const isLiked = isTrackLiked(track.id);
    if (isLiked) {
        dom.miniBtnLike.classList.add('liked');
        dom.miniBtnLike.querySelector('i').className = 'fa-solid fa-heart';
        dom.fsBtnLike.classList.add('liked');
        dom.fsBtnLike.querySelector('i').className = 'fa-solid fa-heart';
    } else {
        dom.miniBtnLike.classList.remove('liked');
        dom.miniBtnLike.querySelector('i').className = 'fa-regular fa-heart';
        dom.fsBtnLike.classList.remove('liked');
        dom.fsBtnLike.querySelector('i').className = 'fa-regular fa-heart';
    }

    // Fullscreen player update
    dom.fsArt.src = track.thumbnail || getTrackThumbnail(track, 400);
    dom.fsBgArt.style.backgroundImage = `url('${track.thumbnail || getTrackThumbnail(track, 400)}')`;
    dom.fsTitle.textContent = track.title;
    dom.fsArtist.textContent = artistName;
    if (dom.fsGenre) {
        dom.fsGenre.textContent = track.genre || 'Music';
    }

    // Reset seek progress
    dom.miniProgress.style.width = '0%';
    dom.fsSlider.value = 0;
    dom.fsTimeCurrent.textContent = '0:00';
    dom.fsTimeTotal.textContent = track.duration || '0:00';

    // Update highlights in current details view if active
    const rows = document.querySelectorAll('.music-row-item');
    rows.forEach(r => r.classList.remove('playing'));
    
    // Find matching row inside list
    const activeRow = Array.from(rows).find(r => {
        const titleEl = r.querySelector('.row-title');
        return titleEl && titleEl.textContent === track.title;
    });
    if (activeRow) activeRow.classList.add('playing');

    // Call dynamic theme color extraction if enabled and completed loading details
    if (!isLoading && state.settings.dynamicTheme) {
        applyDynamicThemeForTrack(track);
    }

    // Render Right Sidebar Queue
    renderRightSidebarQueue();
}

function setPlaybackState(isPlaying) {
    state.isPlaying = isPlaying;
    
    // Toggle play button icons
    const playIcon = '<i class="fa-solid fa-play"></i>';
    const pauseIcon = '<i class="fa-solid fa-pause"></i>';
    
    dom.miniBtnPlay.innerHTML = isPlaying ? pauseIcon : playIcon;
    dom.fsBtnPlay.innerHTML = isPlaying ? pauseIcon : playIcon;

    // Disc rotation animate states
    if (isPlaying) {
        dom.fsDiscArt.classList.add('playing');
        document.getElementById('fullscreen-player')?.classList.add('playing');
        startVisualizerAnimation();
    } else {
        dom.fsDiscArt.classList.remove('playing');
        document.getElementById('fullscreen-player')?.classList.remove('playing');
        stopVisualizerAnimation();
    }

    // Toggle Pet animation loop status
    if (isPlaying) {
        startPlaybackReactions();
        startPetMinuteTick();
        if (state.currentTrack) {
            showPetBubble('play', state.currentTrack.title);
            playPetOnce(ANIM_ROWS.WAVING, 115);
        }
    } else {
        stopPlaybackReactions();
        if (state.currentTrack) {
            showPetBubble('pause', state.currentTrack.title);
        }
    }

    // Render Right Sidebar Queue
    renderRightSidebarQueue();
    
    // Update Right Sidebar Pet Status
    const rsPetStatus = document.getElementById('rs-companion-status');
    if (rsPetStatus) {
        rsPetStatus.textContent = isPlaying ? 'Listening' : 'Waiting';
    }
}

function togglePlayPause() {
    if (!state.currentTrack) return;
    if (state.isPlaying) {
        dom.audio.pause();
    } else {
        dom.audio.play();
    }
}

function playNextTrack() {
    if (state.queue.length === 0) return;
    
    // Manual skip calculation for pet
    if (state.currentTrack && state.isPlaying) {
        const playedMs = dom.audio.currentTime * 1000;
        onPetSongSkipped(playedMs);
        showPetBubble('skip_next', state.currentTrack.title);
        playPetOnce(ANIM_ROWS.RUNNING_RIGHT, 80);
    }

    if (state.repeatMode === 'one') {
        dom.audio.currentTime = 0;
        dom.audio.play();
        return;
    }

    let nextIndex = state.queueIndex + 1;
    if (nextIndex >= state.queue.length) {
        if (state.repeatMode === 'all') {
            nextIndex = 0;
        } else {
            console.log("Queue finished");
            setPlaybackState(false);
            return;
        }
    }

    state.queueIndex = nextIndex;
    const track = state.queue[nextIndex];
    playTrack(track);
}

function playPreviousTrack() {
    if (state.queue.length === 0) return;

    if (dom.audio.currentTime > 3) {
        dom.audio.currentTime = 0;
        return;
    }

    // Manual skip back calculation for pet
    if (state.currentTrack && state.isPlaying) {
        const playedMs = dom.audio.currentTime * 1000;
        onPetSongSkipped(playedMs);
        showPetBubble('skip_prev', state.currentTrack.title);
        playPetOnce(ANIM_ROWS.RUNNING_LEFT, 80);
    }

    let prevIndex = state.queueIndex - 1;
    if (prevIndex < 0) {
        if (state.repeatMode === 'all') {
            prevIndex = state.queue.length - 1;
        } else {
            prevIndex = 0; // Stick to first
        }
    }

    state.queueIndex = prevIndex;
    const track = state.queue[prevIndex];
    playTrack(track);
}

function handleTrackEnded() {
    if (state.currentTrack && state.isPlaying) {
        const durationMs = dom.audio.duration * 1000 || 180000;
        const genre = detectGenre(state.currentTrack.title, state.currentTrack.artist || state.currentTrack.subtitle);
        onPetSongCompleted(durationMs, genre);
    }
    playNextTrack();
}

function handleTimeUpdate() {
    const current = dom.audio.currentTime;
    const duration = dom.audio.duration;
    if (!duration) return;

    // Hook stats tracker
    if (typeof handleTimeUpdateStats === 'function') {
        handleTimeUpdateStats(current);
    }

    const pct = (current / duration) * 100;
    
    // Update progress lines
    if (!state.isMiniProgressDragging) {
        dom.miniProgress.style.width = `${pct}%`;
    }
    dom.fsSlider.value = pct;
    
    dom.fsTimeCurrent.textContent = formatTime(current);
    dom.fsTimeTotal.textContent = formatTime(duration);

    // Sync scrolling lyrics
    if (state.syncedLyrics.length > 0) {
        updateLyricsHighlight(current);
    }
}

// -------------------------------------------------------------
// Playback modifiers logic
// -------------------------------------------------------------
function toggleShuffle() {
    state.isShuffled = !state.isShuffled;
    dom.fsBtnShuffle.classList.toggle('active', state.isShuffled);

    if (state.isShuffled) {
        const trackToKeep = state.currentTrack;
        let pool = state.queue.filter(t => t.id !== trackToKeep.id);
        
        // Fisher-Yates shuffle
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        
        state.queue = [trackToKeep, ...pool];
        state.queueIndex = 0;
    } else {
        state.queue = [...state.originalQueue];
        state.queueIndex = state.queue.findIndex(t => t.id === state.currentTrack.id);
    }
    showToast(state.isShuffled ? "Shuffle On" : "Shuffle Off", "info");
}

function toggleRepeat() {
    if (state.repeatMode === 'none') {
        state.repeatMode = 'all';
        dom.fsBtnRepeat.className = 'fs-control-btn secondary active';
        dom.fsBtnRepeat.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        dom.fsBtnRepeat.title = "Repeat All";
    } else if (state.repeatMode === 'all') {
        state.repeatMode = 'one';
        dom.fsBtnRepeat.className = 'fs-control-btn secondary active';
        dom.fsBtnRepeat.innerHTML = '<i class="fa-solid fa-repeat-1"></i>';
        dom.fsBtnRepeat.title = "Repeat One";
    } else {
        state.repeatMode = 'none';
        dom.fsBtnRepeat.className = 'fs-control-btn secondary';
        dom.fsBtnRepeat.innerHTML = '<i class="fa-solid fa-repeat"></i>';
        dom.fsBtnRepeat.title = "Repeat Off";
    }
    showToast(`Repeat: ${state.repeatMode.toUpperCase()}`, "info");
}

// Fullscreen panels open/close
function openFullscreenPlayer() {
    dom.fullscreenPlayer.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    initVisualizerCanvases();
    if (state.settings.squigglySlider) {
        startSquigglyAnimation();
    }
    if (state.isPlaying) {
        startVisualizerAnimation();
    }
}

function closeFullscreenPlayer() {
    dom.fullscreenPlayer.style.display = 'none';
    document.body.style.overflow = 'auto';
    stopSquigglyAnimation();
    
    // Stop visualizer animation if right sidebar is not visible (e.g., on mobile)
    const isRsVisible = window.innerWidth >= 1024;
    if (!isRsVisible) {
        stopVisualizerAnimation();
    }
}

// Sound Volume controller helper
function updateVolumeIcon(val) {
    const icon = dom.fsVolumeIcon.querySelector('i');
    if (val === 0 || state.isMuted) {
        icon.className = 'fa-solid fa-volume-mute';
    } else if (val < 0.3) {
        icon.className = 'fa-solid fa-volume-low';
    } else if (val < 0.7) {
        icon.className = 'fa-solid fa-volume-medium';
    } else {
        icon.className = 'fa-solid fa-volume-high';
    }
}

function toggleMute() {
    state.isMuted = !state.isMuted;
    dom.audio.muted = state.isMuted;
    updateVolumeIcon(state.isMuted ? 0 : state.volume);
}

// -------------------------------------------------------------
// Interactive Synced Lyrics Engine
// -------------------------------------------------------------
async function fetchLyrics(title, artist) {
    dom.lyricsBody.innerHTML = '<div class="lyrics-placeholder"><i class="fa-solid fa-magnifying-glass-music animate-pulse"></i> Searching lyrics...</div>';
    dom.lyricsSyncBadge.style.display = 'none';
    state.syncedLyrics = [];
    state.activeLyricsIndex = -1;

    try {
        const query = `title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
        const response = await fetch(`/api/lyrics?${query}`);
        const data = await response.json();
        
        if (data.synced) {
            parseLrcLyrics(data.lyrics);
            dom.lyricsSyncBadge.textContent = "Synced";
            dom.lyricsSyncBadge.style.display = 'inline-block';
        } else {
            state.syncedLyrics = [];
            dom.lyricsSyncBadge.textContent = "Plain Text";
            dom.lyricsSyncBadge.style.display = 'inline-block';
            
            const lines = data.lyrics.split('\n');
            dom.lyricsBody.innerHTML = '';
            lines.forEach(line => {
                const p = document.createElement('p');
                p.className = 'lyrics-line-static';
                p.style.fontSize = '17px';
                p.style.lineHeight = '1.6';
                p.style.color = 'rgba(255,255,255,0.7)';
                p.style.marginBottom = '12px';
                p.textContent = line || ' ';
                dom.lyricsBody.appendChild(p);
            });
        }
    } catch (e) {
        console.error("Lyrics fetching error:", e);
        dom.lyricsBody.innerHTML = '<div class="lyrics-placeholder">Could not load lyrics.</div>';
    }
}

function parseLrcLyrics(lrcString) {
    const lines = lrcString.split('\n');
    const regex = /\[(\d+):(\d+)\.(\d+)\](.*)/;
    
    state.syncedLyrics = [];
    dom.lyricsBody.innerHTML = '';

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            const mins = parseInt(match[1]);
            const secs = parseInt(match[2]);
            const ms = parseInt(match[3]);
            const text = match[4].trim();

            const time = mins * 60 + secs + ms / 100;
            
            if (text) {
                state.syncedLyrics.push({ time, text });
            }
        }
    });

    if (state.syncedLyrics.length === 0) {
        dom.lyricsBody.innerHTML = '<div class="lyrics-placeholder">Lyrics parsing failed.</div>';
        return;
    }

    state.syncedLyrics.forEach((line, index) => {
        const el = document.createElement('div');
        el.className = 'lyrics-line';
        el.textContent = line.text;
        el.setAttribute('data-index', index);
        
        el.onclick = () => {
            dom.audio.currentTime = line.time;
            updateLyricsHighlight(line.time);
        };

        dom.lyricsBody.appendChild(el);
    });
}

function updateLyricsHighlight(currentTime) {
    if (state.syncedLyrics.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < state.syncedLyrics.length; i++) {
        if (currentTime >= state.syncedLyrics[i].time) {
            activeIdx = i;
        } else {
            break;
        }
    }

    if (activeIdx !== -1 && activeIdx !== state.activeLyricsIndex) {
        const lines = dom.lyricsBody.querySelectorAll('.lyrics-line');
        lines.forEach(el => el.classList.remove('active'));

        const activeEl = dom.lyricsBody.querySelector(`.lyrics-line[data-index="${activeIdx}"]`);
        if (activeEl) {
            activeEl.classList.add('active');
            
            const containerHeight = dom.lyricsBody.clientHeight;
            const lineOffsetTop = activeEl.offsetTop;
            const lineHeight = activeEl.clientHeight;
            
            dom.lyricsBody.scrollTop = lineOffsetTop - (containerHeight / 2) + (lineHeight / 2);
        }

        state.activeLyricsIndex = activeIdx;
    }
}

// -------------------------------------------------------------
// Customization & Theme Manager (LocalStorage & Dynamic Song Colors)
// -------------------------------------------------------------
function loadSettingsFromStorage() {
    try {
        state.settings = {
            themeMode: localStorage.getItem('zynic_theme_mode') || 'oled',
            dynamicTheme: localStorage.getItem('zynic_dynamic_theme') !== 'false',
            accentColor: localStorage.getItem('zynic_accent_color') || '#ec5464',
            showPet: localStorage.getItem('zynic_show_pet') !== 'false',
            playerTheme: localStorage.getItem('zynic_player_theme') || 'turntable',
            lyricsStyle: localStorage.getItem('zynic_lyrics_style') || 'fade',
            squigglySlider: localStorage.getItem('zynic_squiggly_slider') === 'true',
            hidePlayerThumbnail: localStorage.getItem('zynic_hide_player_thumbnail') === 'true',
            miniPlayerBgStyle: localStorage.getItem('zynic_mini_player_bg_style') || 'glass',
            playerButtonsStyle: localStorage.getItem('zynic_player_buttons_style') || 'default',
            displayName: localStorage.getItem('zynic_display_name') || 'Guest'
        };
    } catch (e) {
        console.error("Failed to load settings:", e);
        state.settings = {
            themeMode: 'oled',
            dynamicTheme: true,
            accentColor: '#ec5464',
            showPet: true,
            playerTheme: 'vinyl',
            lyricsStyle: 'fade',
            squigglySlider: false,
            hidePlayerThumbnail: false,
            miniPlayerBgStyle: 'glass',
            playerButtonsStyle: 'default',
            displayName: 'Guest'
        };
    }
    
    applyThemeSettings();
}

function saveSettingsToStorage() {
    try {
        localStorage.setItem('zynic_theme_mode', state.settings.themeMode);
        localStorage.setItem('zynic_dynamic_theme', state.settings.dynamicTheme);
        localStorage.setItem('zynic_accent_color', state.settings.accentColor);
        localStorage.setItem('zynic_show_pet', state.settings.showPet);
        localStorage.setItem('zynic_player_theme', state.settings.playerTheme);
        localStorage.setItem('zynic_lyrics_style', state.settings.lyricsStyle);
        localStorage.setItem('zynic_squiggly_slider', state.settings.squigglySlider);
        localStorage.setItem('zynic_hide_player_thumbnail', state.settings.hidePlayerThumbnail);
        localStorage.setItem('zynic_mini_player_bg_style', state.settings.miniPlayerBgStyle);
        localStorage.setItem('zynic_player_buttons_style', state.settings.playerButtonsStyle);
        localStorage.setItem('zynic_display_name', state.settings.displayName || 'Guest');
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

function applyThemeSettings() {
    // 1. Theme Mode Selection
    const mode = state.settings.themeMode;
    let activeTheme = mode;
    if (mode === 'auto') {
        // Auto always resolves to oled in Zynic
        activeTheme = 'oled';
    }
    
    document.body.setAttribute('data-theme', activeTheme);
    
    // Toggle active classes on customization buttons
    const btnAuto = document.getElementById('theme-btn-auto');
    const btnDark = document.getElementById('theme-btn-dark');
    const btnOled = document.getElementById('theme-btn-pureblack');
    
    if (btnAuto) btnAuto.classList.toggle('active', mode === 'auto');
    if (btnDark) btnDark.classList.toggle('active', mode === 'dark');
    if (btnOled) btnOled.classList.toggle('active', mode === 'oled');
    
    // 2. Dynamic Theme switch
    const dynCheckbox = document.getElementById('settings-dynamic-theme');
    if (dynCheckbox) dynCheckbox.checked = state.settings.dynamicTheme;
    
    const staticGroup = document.getElementById('static-color-group');
    if (staticGroup) {
        staticGroup.style.display = state.settings.dynamicTheme ? 'none' : 'block';
    }
    
    // Set active color dot indicator
    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
        const hex = dot.getAttribute('data-color');
        dot.classList.toggle('active', hex === state.settings.accentColor);
    });
    
    // 3. Floating Pet Companion visibility toggle
    const petCheckbox = document.getElementById('settings-show-pet');
    if (petCheckbox) petCheckbox.checked = state.settings.showPet;
    
    const petContainer = document.getElementById('floating-pet-container');
    if (petContainer) {
        if (state.settings.showPet && petState.selectedPetId) {
            petContainer.style.display = 'flex';
        } else {
            petContainer.style.display = 'none';
        }
    }
    
    // 4. Squiggly Slider active class
    const squigglyCheckbox = document.getElementById('settings-squiggly-slider');
    if (squigglyCheckbox) squigglyCheckbox.checked = state.settings.squigglySlider;
    document.body.classList.toggle('squiggly-slider-active', state.settings.squigglySlider);
    if (state.settings.squigglySlider) {
        startSquigglyAnimation();
    }
    
    // 5. Hide Player Thumbnail active class
    const hideThumbCheckbox = document.getElementById('settings-hide-thumbnail');
    if (hideThumbCheckbox) hideThumbCheckbox.checked = state.settings.hidePlayerThumbnail;
    document.body.classList.toggle('hide-player-thumbnail-active', state.settings.hidePlayerThumbnail);
    
    // 6. Mini-Player Background Style
    const miniBgSel = document.getElementById('settings-mini-bg');
    if (miniBgSel) miniBgSel.value = state.settings.miniPlayerBgStyle;
    
    const miniPlayer = document.getElementById('mini-player');
    if (miniPlayer) {
        ['mini-bg-glass', 'mini-bg-transparent', 'mini-bg-solid', 'mini-bg-pureblack', 'mini-bg-gradient'].forEach(c => miniPlayer.classList.remove(c));
        miniPlayer.classList.add(`mini-bg-${state.settings.miniPlayerBgStyle}`);
    }
    
    // 7. Player Buttons Style
    const buttonsStyleSel = document.getElementById('settings-buttons-style');
    if (buttonsStyleSel) buttonsStyleSel.value = state.settings.playerButtonsStyle;
    
    const fsControls = document.querySelector('.fs-controls');
    if (fsControls) {
        ['buttons-style-default', 'buttons-style-filled', 'buttons-style-tinted'].forEach(c => fsControls.classList.remove(c));
        fsControls.classList.add(`buttons-style-${state.settings.playerButtonsStyle}`);
    }
    
    // 8. Accent update
    if (state.settings.dynamicTheme && state.currentTrack) {
        applyDynamicThemeForTrack(state.currentTrack);
    } else {
        // Reset base background to its clean theme defaults
        document.documentElement.style.removeProperty('--bg-base');
        document.documentElement.style.removeProperty('--bg-surface');
        document.documentElement.style.removeProperty('--bg-surface-elevated');
        document.documentElement.style.removeProperty('--bg-glass');
        document.documentElement.style.removeProperty('--accent-light');
        document.documentElement.style.removeProperty('--accent-glow');
        applyStaticAccentColor(state.settings.accentColor);
    }
    
    // 9. Player Theme Style
    applyPlayerTheme(state.settings.playerTheme);
    
    // 10. Lyrics Animation Style
    applyLyricsStyle(state.settings.lyricsStyle);
    
    // 11. Sync the dropdowns with current persisted values
    const playerThemeSel = document.getElementById('settings-player-theme');
    if (playerThemeSel) playerThemeSel.value = state.settings.playerTheme;
    const lyricsStyleSel = document.getElementById('settings-lyrics-style');
    if (lyricsStyleSel) lyricsStyleSel.value = state.settings.lyricsStyle;
}

function updateUserProfile() {
    // localStorage is the source of truth; fall back to settings state then 'Guest'
    const name = localStorage.getItem('zynic_profile_name')
        || (state.settings && state.settings.displayName)
        || 'Guest';
    const bio = localStorage.getItem('zynic_profile_bio') || '';

    // Keep settings state in sync
    if (state.settings) state.settings.displayName = name;

    // Update input in settings modal if present
    const nameInput = document.getElementById('settings-display-name');
    if (nameInput) nameInput.value = name;

    // Sidebar name
    const rsName = document.getElementById('rs-user-name-text');
    if (rsName) rsName.textContent = name;

    // Sidebar subtitle — show bio if set, otherwise generic line
    const rsSub = document.getElementById('rs-user-sub-text');
    if (rsSub) rsSub.textContent = bio || (name === 'Guest' ? 'Listening as Guest' : `Listening as ${name}`);

    // Initials badge
    const rsInitials = document.getElementById('rs-avatar-initials');
    if (rsInitials) {
        rsInitials.textContent = name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'G';
    }

    // Avatar: show stored photo if available
    const avatarB64 = localStorage.getItem('zynic_profile_avatar');
    const sidebarImg = document.getElementById('rs-user-avatar-img');
    if (sidebarImg) {
        if (avatarB64) { sidebarImg.src = avatarB64; sidebarImg.style.display = 'block'; if (rsInitials) rsInitials.style.display = 'none'; }
        else { sidebarImg.style.display = 'none'; if (rsInitials) rsInitials.style.display = 'block'; }
    }

    // Header status
    const headerStatus = document.getElementById('user-status-text');
    if (headerStatus) headerStatus.textContent = name === 'Guest' ? 'Guest Mode' : name;

    // Crown
    const crown = document.getElementById('rs-premium-crown');
    if (crown) crown.style.display = name !== 'Guest' ? 'inline-block' : 'none';
}

// -------------------------------------------------------------
// Squiggly Slider Animation Engine
// -------------------------------------------------------------
let squigglyAnimationId = null;
let squigglyPhase = 0;
let squigglyHeightFraction = 0;

function initSquigglySlider() {
    const canvas = document.getElementById('fs-squiggly-canvas');
    if (!canvas) return;
    
    const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function startSquigglyAnimation() {
    if (squigglyAnimationId) return;
    
    const canvas = document.getElementById('fs-squiggly-canvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let lastTime = performance.now();
    
    const animate = (timestamp) => {
        if (!state.settings.squigglySlider) {
            stopSquigglyAnimation();
            return;
        }
        
        // Stop animation CPU cost when player is closed
        const fsPlayer = document.getElementById('fullscreen-player');
        if (fsPlayer && fsPlayer.style.display === 'none') {
            stopSquigglyAnimation();
            return;
        }
        
        const delta = (timestamp - lastTime) / 1000;
        lastTime = timestamp;
        
        const slider = document.getElementById('fs-slider');
        const isDragging = slider && (document.activeElement === slider);
        const targetHeight = (state.isPlaying && !isDragging) ? 1.0 : 0.0;
        
        squigglyHeightFraction += (targetHeight - squigglyHeightFraction) * 0.15;
        
        if (state.isPlaying) {
            squigglyPhase += delta * 45; // Wave propagation speed
            squigglyPhase %= 80;
        }
        
        drawSquigglyWave(canvas, ctx);
        
        squigglyAnimationId = requestAnimationFrame(animate);
    };
    squigglyAnimationId = requestAnimationFrame(animate);
}

function stopSquigglyAnimation() {
    if (squigglyAnimationId) {
        cancelAnimationFrame(squigglyAnimationId);
        squigglyAnimationId = null;
    }
}

function drawSquigglyWave(canvas, ctx) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const centerY = h / 2;
    const slider = document.getElementById('fs-slider');
    const val = slider ? parseFloat(slider.value) : 0;
    const maxVal = slider ? parseFloat(slider.max) : 100;
    const progress = maxVal > 0 ? val / maxVal : 0;
    const progressPx = w * progress;
    
    const waveLength = 65;
    const maxAmplitude = 5;
    const currentAmplitude = maxAmplitude * squigglyHeightFraction;
    
    // Draw played track
    ctx.beginPath();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ec5464';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    
    for (let x = 0; x <= progressPx; x++) {
        let ampCoeff = 1.0;
        const transitionLength = 40;
        if (progressPx - x < transitionLength) {
            ampCoeff = (progressPx - x) / transitionLength;
        }
        
        const y = centerY + Math.sin((x - squigglyPhase) / waveLength * 2 * Math.PI) * currentAmplitude * ampCoeff;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw unplayed track
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 4;
    
    for (let x = progressPx; x <= w; x++) {
        let ampCoeff = 1.0;
        const transitionLength = 40;
        if (x - progressPx < transitionLength) {
            ampCoeff = (x - progressPx) / transitionLength;
        }
        
        const y = centerY + Math.sin((x - squigglyPhase) / waveLength * 2 * Math.PI) * currentAmplitude * ampCoeff;
        if (x === progressPx) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

// -------------------------------------------------------------
// Petdex Registry API Client
// -------------------------------------------------------------
let petdexManifest = null;
let petdexLoading = false;

async function loadPetdexRegistry() {
    if (petdexManifest) return petdexManifest;
    if (petdexLoading) return null;
    
    petdexLoading = true;
    const loader = document.getElementById('pet-gallery-loader');
    if (loader) loader.style.display = 'block';
    
    try {
        const response = await fetch('/api/petdex/manifest');
        const data = await response.json();
        const petsArray = Array.isArray(data) ? data : (data && data.pets ? data.pets : null);
        if (petsArray) {
            petdexManifest = petsArray.map(p => ({
                id: `petdex::${p.slug}`,
                displayName: p.displayName || p.slug,
                description: `A community pet created by ${p.submittedBy || 'unknown'}.`,
                spritesheet: p.spritesheetUrl,
                personality: 'playful',
                favoriteGenres: ['all'],
                status: 'petdex'
            }));
            console.log(`Loaded ${petdexManifest.length} Petdex pets successfully!`);
        }
    } catch (e) {
        console.error("Failed to load Petdex manifest:", e);
        showToast("Error loading Petdex Registry", "error");
    } finally {
        petdexLoading = false;
        if (loader) loader.style.display = 'none';
    }
    
    return petdexManifest;
}

/** Applies the selected player theme class to the fullscreen player element. */
function applyPlayerTheme(theme) {
    const fp = document.getElementById('fullscreen-player');
    if (!fp) return;
    // Remove all theme classes then apply the desired one
    ['theme-vinyl', 'theme-minimalist', 'theme-turntable', 'theme-waveform'].forEach(c => fp.classList.remove(c));
    fp.classList.add(`theme-${theme}`);
}

/** Applies the selected lyrics animation class to the lyrics container. */
function applyLyricsStyle(style) {
    const lyricsBody = document.querySelector('.lyrics-body-container');
    if (!lyricsBody) return;
    ['lyrics-fade', 'lyrics-glow', 'lyrics-slide', 'lyrics-apple-music'].forEach(c => lyricsBody.classList.remove(c));
    if (style !== 'none') {
        lyricsBody.classList.add(`lyrics-${style}`);
    }
}

function applyStaticAccentColor(hex) {
    document.documentElement.style.setProperty('--accent', hex);
    
    const rgb = hexToRgb(hex);
    if (rgb) {
        document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        document.documentElement.style.setProperty('--primary-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
        document.documentElement.style.setProperty('--accent-glow', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
        
        const accentLight = blendColors(hex, "#ffffff", 0.45);
        document.documentElement.style.setProperty('--accent-light', accentLight);
        
        // Linear gradient blending primary to complementary dark purple
        const secondary = blendColors(hex, "#5500aa", 0.4);
        document.documentElement.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${hex} 0%, ${secondary} 100%)`);
    }
}

let extractedColorCache = {}; // Cache map for computed track palettes

async function applyDynamicThemeForTrack(track) {
    if (!track || !track.thumbnail || !state.settings.dynamicTheme) return;
    
    if (extractedColorCache[track.id]) {
        applyDynamicAccents(extractedColorCache[track.id]);
        return;
    }
    
    const colors = await extractColorsFromImage(track.thumbnail);
    if (colors) {
        extractedColorCache[track.id] = colors;
        applyDynamicAccents(colors);
    }
}

function applyDynamicAccents(colors) {
    if (!state.settings.dynamicTheme) return;
    
    const mainHex = rgbToHex(colors.primary.r, colors.primary.g, colors.primary.b);
    document.documentElement.style.setProperty('--accent', mainHex);
    document.documentElement.style.setProperty('--accent-rgb', `${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}`);
    document.documentElement.style.setProperty('--primary-glow', `rgba(${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}, 0.35)`);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${colors.primary.r}, ${colors.primary.g}, ${colors.primary.b}, 0.2)`);
    
    const accentLight = blendColors(mainHex, "#ffffff", 0.45);
    document.documentElement.style.setProperty('--accent-light', accentLight);
    
    const secondaryHex = rgbToHex(colors.secondary.r, colors.secondary.g, colors.secondary.b);
    document.documentElement.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${mainHex} 0%, ${secondaryHex} 100%)`);
    
    // Ambient background blending (disabled for OLED Black)
    if (state.settings.themeMode !== 'oled') {
        const activeTheme = state.settings.themeMode === 'auto' ? 
            (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : 
            state.settings.themeMode;
            
        if (activeTheme === 'dark') {
            // Dark base background blended with 6% of the primary extracted color
            const darkBg = rgbToHex(
                Math.round(7 * 0.94 + colors.primary.r * 0.06),
                Math.round(7 * 0.94 + colors.primary.g * 0.06),
                Math.round(13 * 0.94 + colors.primary.b * 0.06)
            );
            document.documentElement.style.setProperty('--bg-base', darkBg);
            
            // Standardize surfaces
            const darkSurface = rgbToHex(
                Math.round(16 * 0.94 + colors.primary.r * 0.06),
                Math.round(16 * 0.94 + colors.primary.g * 0.06),
                Math.round(24 * 0.94 + colors.primary.b * 0.06)
            );
            const darkSurfaceElevated = rgbToHex(
                Math.round(22 * 0.94 + colors.primary.r * 0.06),
                Math.round(22 * 0.94 + colors.primary.g * 0.06),
                Math.round(34 * 0.94 + colors.primary.b * 0.06)
            );
            document.documentElement.style.setProperty('--bg-surface', darkSurface);
            document.documentElement.style.setProperty('--bg-surface-elevated', darkSurfaceElevated);
            document.documentElement.style.setProperty('--bg-glass', `rgba(${Math.round(16 * 0.94 + colors.primary.r * 0.06)}, ${Math.round(16 * 0.94 + colors.primary.g * 0.06)}, ${Math.round(24 * 0.94 + colors.primary.b * 0.06)}, 0.65)`);
        } else {
            // Light base background blended with 4% of the primary extracted color
            const lightBg = rgbToHex(
                Math.round(244 * 0.96 + colors.primary.r * 0.04),
                Math.round(246 * 0.96 + colors.primary.g * 0.04),
                Math.round(250 * 0.96 + colors.primary.b * 0.04)
            );
            document.documentElement.style.setProperty('--bg-base', lightBg);
            
            const lightSurface = rgbToHex(
                Math.round(255 * 0.97 + colors.primary.r * 0.03),
                Math.round(255 * 0.97 + colors.primary.g * 0.03),
                Math.round(255 * 0.97 + colors.primary.b * 0.03)
            );
            const lightSurfaceElevated = rgbToHex(
                Math.round(235 * 0.97 + colors.primary.r * 0.03),
                Math.round(237 * 0.97 + colors.primary.g * 0.03),
                Math.round(242 * 0.97 + colors.primary.b * 0.03)
            );
            document.documentElement.style.setProperty('--bg-surface', lightSurface);
            document.documentElement.style.setProperty('--bg-surface-elevated', lightSurfaceElevated);
            document.documentElement.style.setProperty('--bg-glass', `rgba(${Math.round(255 * 0.97 + colors.primary.r * 0.03)}, ${Math.round(255 * 0.97 + colors.primary.g * 0.03)}, ${Math.round(255 * 0.97 + colors.primary.b * 0.03)}, 0.85)`);
        }
    } else {
        document.documentElement.style.setProperty('--bg-base', '#000000');
        document.documentElement.style.setProperty('--bg-surface', '#070709');
        document.documentElement.style.setProperty('--bg-surface-elevated', '#0e0e11');
        document.documentElement.style.setProperty('--bg-glass', 'rgba(0, 0, 0, 0.85)');
    }
}

function extractColorsFromImage(imageUrl) {
    return new Promise((resolve) => {
        if (!imageUrl) {
            resolve(null);
            return;
        }
        
        let targetUrl = imageUrl;
        if (imageUrl.startsWith('http') && !imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
            targetUrl = `/api/proxy_image?url=${encodeURIComponent(imageUrl)}`;
        }
        
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = targetUrl;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 30;
                canvas.height = 30;
                ctx.drawImage(img, 0, 0, 30, 30);
                
                const imgData = ctx.getImageData(0, 0, 30, 30).data;
                const colorsList = [];
                
                for (let i = 0; i < imgData.length; i += 4) {
                    const r = imgData[i];
                    const g = imgData[i + 1];
                    const b = imgData[i + 2];
                    const a = imgData[i + 3];
                    if (a < 200) continue;
                    
                    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    if (luminance > 40 && luminance < 220) {
                        colorsList.push({ r, g, b });
                    }
                }
                
                if (colorsList.length === 0) {
                    let rAvg = 0, gAvg = 0, bAvg = 0, count = 0;
                    for (let i = 0; i < imgData.length; i += 4) {
                        rAvg += imgData[i];
                        gAvg += imgData[i+1];
                        bAvg += imgData[i+2];
                        count++;
                    }
                    rAvg = Math.round(rAvg / count);
                    gAvg = Math.round(gAvg / count);
                    bAvg = Math.round(bAvg / count);
                    resolve({
                        primary: { r: rAvg, g: gAvg, b: bAvg },
                        secondary: { r: Math.max(0, rAvg - 45), g: Math.max(0, gAvg - 45), b: Math.max(0, bAvg - 45) }
                    });
                    return;
                }
                
                const buckets = {};
                colorsList.forEach(c => {
                    const k = `${Math.floor(c.r / 64)},${Math.floor(c.g / 64)},${Math.floor(c.b / 64)}`;
                    if (!buckets[k]) buckets[k] = { r: 0, g: 0, b: 0, count: 0 };
                    buckets[k].r += c.r;
                    buckets[k].g += c.g;
                    buckets[k].b += c.b;
                    buckets[k].count++;
                });
                
                const sortedBuckets = Object.values(buckets).sort((a, b) => b.count - a.count);
                const best = sortedBuckets[0];
                const rPri = Math.round(best.r / best.count);
                const gPri = Math.round(best.g / best.count);
                const bPri = Math.round(best.b / best.count);
                
                let rSec = Math.max(0, rPri - 40);
                let gSec = Math.max(0, gPri - 60);
                let bSec = Math.max(0, bPri - 20);
                if (sortedBuckets.length > 1) {
                    const nextBest = sortedBuckets[1];
                    rSec = Math.round(nextBest.r / nextBest.count);
                    gSec = Math.round(nextBest.g / nextBest.count);
                    bSec = Math.round(nextBest.b / nextBest.count);
                }
                
                resolve({
                    primary: { r: rPri, g: gPri, b: bPri },
                    secondary: { r: rSec, g: gSec, b: bSec }
                });
            } catch (err) {
                console.warn("Canvas dynamic extraction failed:", err);
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function blendColors(c1, c2, weight) {
    const rgb1 = hexToRgb(c1) || { r: 236, g: 84, b: 100 };
    const rgb2 = hexToRgb(c2) || { r: 85, g: 0, b: 170 };
    const r = Math.round(rgb1.r * (1 - weight) + rgb2.r * weight);
    const g = Math.round(rgb1.g * (1 - weight) + rgb2.g * weight);
    const b = Math.round(rgb1.b * (1 - weight) + rgb2.b * weight);
    return rgbToHex(r, g, b);
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// -------------------------------------------------------------
// Library Manager (LocalStorage Caching)
// -------------------------------------------------------------
function loadLibraryFromStorage() {
    try {
        const liked = localStorage.getItem('zynic_liked');
        const recent = localStorage.getItem('zynic_recent');
        const playlists = localStorage.getItem('zynic_user_playlists');
        
        state.likedTracks = liked ? JSON.parse(liked) : [];
        state.recentTracks = recent ? JSON.parse(recent) : [];
        state.userPlaylists = playlists ? JSON.parse(playlists) : [];
    } catch (e) {
        console.error("Local storage error:", e);
        state.likedTracks = [];
        state.recentTracks = [];
        state.userPlaylists = [];
    }
}

function saveLibraryToStorage() {
    try {
        localStorage.setItem('zynic_liked', JSON.stringify(state.likedTracks));
        localStorage.setItem('zynic_recent', JSON.stringify(state.recentTracks));
        localStorage.setItem('zynic_user_playlists', JSON.stringify(state.userPlaylists));
    } catch (e) {
        console.error("Save to local storage failed:", e);
    }
}

function isTrackLiked(id) {
    return state.likedTracks.some(t => t.id === id);
}

function toggleLikeTrack(track) {
    if (!track) return;
    
    const idx = state.likedTracks.findIndex(t => t.id === track.id);
    if (idx !== -1) {
        state.likedTracks.splice(idx, 1);
        showToast("Removed from Library", "info");

        // Pet unlike reaction
        mutatePetStats({ vibe: -1.0 });
        showPetBubble('unlike', track.title);
        playPetOnce(ANIM_ROWS.FAILED, 130);
    } else {
        state.likedTracks.unshift(track);
        showToast("Added to Library");

        // Pet like reaction
        mutatePetStats({ vibe: 2.0 });
        showPetBubble('like', track.title);
        playPetOnce(ANIM_ROWS.JUMPING, 105);
    }
    
    saveLibraryToStorage();
    
    // Synchronize UI buttons
    updatePlayerUI(track, false);

    // Refresh library lists
    if (state.currentTab === 'library') {
        renderLibrary();
    }
}

function addToRecentHistory(track) {
    if (!track) return;
    state.recentTracks = state.recentTracks.filter(t => t.id !== track.id);
    state.recentTracks.unshift(track);
    
    if (state.recentTracks.length > 30) {
        state.recentTracks.pop();
    }
    
    saveLibraryToStorage();
    
    // Reactively refresh home shelves if currently on home tab and home data is cached
    if (state.currentTab === 'home' && state.cache.home) {
        renderHomeFeed(state.cache.home);
    }
}

function renderLibrary() {
    // Favorites List
    dom.likedSongsList.innerHTML = '';
    if (state.likedTracks.length > 0) {
        dom.likedSongsEmpty.style.display = 'none';
        const fragment = document.createDocumentFragment();
        state.likedTracks.forEach((track, index) => {
            const row = createMusicRow(track, index + 1, state.likedTracks);
            fragment.appendChild(row);
        });
        dom.likedSongsList.appendChild(fragment);
    } else {
        dom.likedSongsEmpty.style.display = 'flex';
    }

    // Playlists Grid
    if (dom.userPlaylistsGrid) {
        dom.userPlaylistsGrid.innerHTML = '';
        if (state.userPlaylists && state.userPlaylists.length > 0) {
            if (dom.userPlaylistsEmpty) dom.userPlaylistsEmpty.style.display = 'none';
            const fragment = document.createDocumentFragment();
            state.userPlaylists.forEach(pl => {
                const card = document.createElement('div');
                card.className = 'music-card';
                
                const coverUrl = pl.thumbnail || getTrackThumbnail(pl, 300);
                
                card.innerHTML = `
                    <div class="card-art-wrapper">
                        <img src="${coverUrl}" alt="${pl.title}" class="card-art" loading="lazy" onerror="handleImageError(this, '${pl.id}', 300)">
                        <button class="play-hover-btn"><i class="fa-solid fa-play"></i></button>
                    </div>
                    <div class="card-title" title="${pl.title}">${pl.title}</div>
                    <div class="card-subtitle" title="${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}">${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}</div>
                `;
                
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.play-hover-btn')) {
                        e.stopPropagation();
                        if (pl.tracks.length > 0) {
                            playTrack(pl.tracks[0], pl.tracks);
                        } else {
                            showToast("Playlist is empty", "info");
                        }
                        return;
                    }
                    navigateToTab(`detail::${pl.id}`);
                });
                
                fragment.appendChild(card);
            });
            dom.userPlaylistsGrid.appendChild(fragment);
        } else {
            if (dom.userPlaylistsEmpty) dom.userPlaylistsEmpty.style.display = 'flex';
        }
    }

    // History List
    dom.recentSongsList.innerHTML = '';
    if (state.recentTracks.length > 0) {
        dom.recentSongsEmpty.style.display = 'none';
        const fragment = document.createDocumentFragment();
        state.recentTracks.forEach((track, index) => {
            const row = createMusicRow(track, index + 1, state.recentTracks);
            fragment.appendChild(row);
        });
        dom.recentSongsList.appendChild(fragment);
    } else {
        dom.recentSongsEmpty.style.display = 'flex';
    }
}

// -------------------------------------------------------------
// Custom Playlist CRUD & Renderers
// -------------------------------------------------------------
function createPlaylist(name, description = "") {
    const playlistId = 'user_pl_' + Date.now();
    const newPlaylist = {
        id: playlistId,
        title: name,
        description: description,
        thumbnail: "", 
        tracks: [],
        created: Date.now()
    };
    state.userPlaylists.push(newPlaylist);
    saveLibraryToStorage();
    showToast(`Created playlist "${name}"`);
    
    if (state.currentTab === 'library') {
        renderLibrary();
    }
}

let activeAddToTrack = null;

function openAddToPlaylistModal(track) {
    activeAddToTrack = track;
    const container = document.getElementById('add-to-playlists-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (state.userPlaylists.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 12px 0;">No playlists found. Create one first!</div>';
    } else {
        state.userPlaylists.forEach(pl => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.justifyContent = 'flex-start';
            btn.style.padding = '12px 16px';
            btn.style.borderRadius = '12px';
            btn.style.background = 'rgba(255, 255, 255, 0.03)';
            btn.style.border = '1px solid var(--border-glass)';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.marginBottom = '8px';
            btn.style.cursor = 'pointer';
            
            const coverUrl = pl.thumbnail || getTrackThumbnail(pl, 80);
            btn.innerHTML = `
                <img src="${coverUrl}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; margin-right: 12px;" onerror="handleImageError(this, '${pl.id}', 80)">
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <span style="font-weight: 600; font-size: 14px; color: var(--text-primary); text-align: left;">${pl.title}</span>
                    <span style="font-size: 11px; color: var(--text-secondary);">${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}</span>
                </div>
            `;
            
            btn.addEventListener('click', () => {
                addTrackToPlaylist(pl.id, activeAddToTrack);
                const modal = document.getElementById('add-to-playlist-modal');
                if (modal) modal.style.display = 'none';
            });
            container.appendChild(btn);
        });
    }
    
    const modal = document.getElementById('add-to-playlist-modal');
    if (modal) modal.style.display = 'flex';
}

function addTrackToPlaylist(playlistId, track) {
    const pl = state.userPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    
    if (pl.tracks.some(t => t.id === track.id)) {
        showToast("Track already in playlist", "info");
        return;
    }
    
    pl.tracks.push(track);
    if (!pl.thumbnail && track.thumbnail) {
        pl.thumbnail = track.thumbnail;
    }
    
    saveLibraryToStorage();
    showToast(`Added to "${pl.title}"`);
    
    if (state.currentTab === 'library') {
        renderLibrary();
    }
}

function removeTrackFromPlaylist(playlistId, trackId) {
    const pl = state.userPlaylists.find(p => p.id === playlistId);
    if (!pl) return;
    
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    if (pl.tracks.length > 0) {
        pl.thumbnail = pl.tracks[0].thumbnail;
    } else {
        pl.thumbnail = "";
    }
    
    saveLibraryToStorage();
    showToast("Removed from playlist", "info");
    
    if (state.currentTab === `detail::${playlistId}`) {
        loadBrowseDetails(playlistId, true);
    }
}

// -------------------------------------------------------------
// Utilities Helpers
// -------------------------------------------------------------
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Run app init
window.onload = init;

/* =============================================================
   Digital Pet Companion Subsystem Engine
   ============================================================= */

// Static Petdex Database
// Static Petdex Database
const PETS_DB = {
    luma: {
        id: 'luma',
        displayName: 'Luma',
        description: 'A wistful chibi digital pet inspired by a soft-featured girl with long wavy brown hair and a blue-and-pink jacket.',
        spritesheet: 'pets/luma/spritesheet.webp',
        personality: 'cozy',
        favoriteGenres: ['lofi', 'calm', 'acoustic', 'jazz'],
        status: 'built-in'
    },
    daxter: {
        id: 'daxter',
        displayName: 'Daxter',
        description: 'Orange-furred ottsel sidekick from Jak & Daxter, wisecracking with big ears, expressive face, bug-spray backpack gear, and an electric flyswatter.',
        spritesheet: 'pets/daxter/spritesheet.webp',
        personality: 'energetic',
        favoriteGenres: ['party', 'energy', 'rock', 'hiphop', 'electronic'],
        status: 'built-in'
    },
    eve: {
        id: 'eve',
        displayName: 'EVE',
        description: 'A tiny movie-faithful EVE robot companion with expressive blue LED eyes, simplified into Codex digital pet style.',
        spritesheet: 'pets/eve/spritesheet.webp',
        personality: 'focused',
        favoriteGenres: ['ambient', 'electronic', 'calm'],
        status: 'built-in'
    },
    sabo: {
        id: 'sabo',
        displayName: 'Sabo',
        description: 'A tiny chibi revolutionary gentleman pet with a top hat, goggles, blue coat, and occasional attached flame effects.',
        spritesheet: 'pets/sabo/spritesheet.webp',
        personality: 'mysterious',
        favoriteGenres: ['qawwali', 'devotional', 'classical'],
        status: 'built-in'
    },
    nukey: { id: 'nukey', displayName: 'Nukey', description: 'A friendly microwave companion for snack-fueled builds.', personality: 'cozy', favoriteGenres: ['lofi', 'ambient'], status: 'planned', spritesheet: null },
    boba: { id: 'boba', displayName: 'Boba', description: 'A tiny otter sipping bubble tea while keeping you company in Codex.', personality: 'cozy', favoriteGenres: ['lofi', 'calm'], status: 'planned', spritesheet: null },
    boxcat: { id: 'boxcat', displayName: 'Boxcat', description: 'A tiny cat tucked inside a cardboard box for cozy coding sessions.', personality: 'cozy', favoriteGenres: ['lofi', 'acoustic'], status: 'planned', spritesheet: null },
    'captain-quack': { id: 'captain-quack', displayName: 'Captain Quack', description: 'A tiny pirate duck companion with a jaunty hat.', personality: 'playful', favoriteGenres: ['party', 'energy'], status: 'planned', spritesheet: null },
    'corsair-cat': { id: 'corsair-cat', displayName: 'Corsair Cat', description: 'A compact chibi cat wearing a pirate hat, ready as a Codex digital pet.', personality: 'playful', favoriteGenres: ['rock', 'hiphop'], status: 'planned', spritesheet: null },
    'ice-cream-cat': { id: 'ice-cream-cat', displayName: 'Ice Cream Cat', description: 'A cheerful cat carrying an ice cream cone.', personality: 'playful', favoriteGenres: ['pop', 'party'], status: 'planned', spritesheet: null },
    'pelican-pedal': { id: 'pelican-pedal', displayName: 'Pelican Pedal', description: 'A compact Codex digital pet pelican happily riding a tiny bicycle.', personality: 'energetic', favoriteGenres: ['energy', 'electronic'], status: 'planned', spritesheet: null },
    punchy: { id: 'punchy', displayName: 'Punchy', description: 'A scrappy little dog boxer with oversized red gloves.', personality: 'energetic', favoriteGenres: ['rock', 'workout'], status: 'planned', spritesheet: null },
    scoop: { id: 'scoop', displayName: 'Scoop', description: 'A tiny ice cream cone digital pet with a cheerful face.', personality: 'cozy', favoriteGenres: ['calm', 'sweet'], status: 'planned', spritesheet: null },
    skipper: { id: 'skipper', displayName: 'Skipper', description: 'A tiny sailor cat for breezy workspace days.', personality: 'playful', favoriteGenres: ['acoustic', 'jazz'], status: 'planned', spritesheet: null },
    'byte-bunny': { id: 'byte-bunny', displayName: 'Byte Bunny', description: 'A tiny rabbit holding a little keyboard key like a lucky charm.', personality: 'focused', favoriteGenres: ['ambient', 'classical'], status: 'planned', spritesheet: null },
    bugsy: { id: 'bugsy', displayName: 'Bugsy', description: 'A tiny harmless bug with goggles, ready to help inspect tricky diffs.', personality: 'focused', favoriteGenres: ['ambient', 'electronic'], status: 'planned', spritesheet: null },
    'cache-capy': { id: 'cache-capy', displayName: 'Cache Capy', description: 'A calm capybara carrying a tiny cache box for patient builds.', personality: 'cozy', favoriteGenres: ['lofi', 'calm'], status: 'planned', spritesheet: null },
    'commit-crab': { id: 'commit-crab', displayName: 'Commit Crab', description: 'A tiny crab holding a checkmark badge after a clean commit.', personality: 'playful', favoriteGenres: ['rock', 'party'], status: 'planned', spritesheet: null },
    'cursor-crow': { id: 'cursor-crow', displayName: 'Cursor Crow', description: 'A clever little crow perched on a cursor arrow.', personality: 'focused', favoriteGenres: ['classical', 'instrumental'], status: 'planned', spritesheet: null },
    'daemon-dumpling': { id: 'daemon-dumpling', displayName: 'Daemon Dumpling', description: 'A tiny dumpling companion watching background jobs with sleepy eyes.', personality: 'cozy', favoriteGenres: ['lofi', 'sleep'], status: 'planned', spritesheet: null },
    'deploy-dragon': { id: 'deploy-dragon', displayName: 'Deploy Dragon', description: 'A tiny dragon guarding a successful deploy flag.', personality: 'energetic', favoriteGenres: ['rock', 'energy'], status: 'planned', spritesheet: null },
    'diff-dino': { id: 'diff-dino', displayName: 'Diff Dino', description: 'A small dinosaur stomping around a tiny diff marker.', personality: 'playful', favoriteGenres: ['hiphop', 'electronic'], status: 'planned', spritesheet: null },
    'docker-donut': { id: 'docker-donut', displayName: 'Docker Donut', description: 'A donut floating inside a tiny shipping container.', personality: 'playful', favoriteGenres: ['party', 'pop'], status: 'planned', spritesheet: null },
    envy: { id: 'envy', displayName: 'Envy', description: 'A tiny green envelope guarding environment variables.', personality: 'focused', favoriteGenres: ['ambient', 'calm'], status: 'planned', spritesheet: null },
    'fiber-fox': { id: 'fiber-fox', displayName: 'Fiber Fox', description: 'A quick little fox wrapped in a glowing fiber cable.', personality: 'energetic', favoriteGenres: ['electronic', 'fast'], status: 'planned', spritesheet: null },
    'figma-frog': { id: 'figma-frog', displayName: 'Figma Frog', description: 'A tiny frog carrying colorful design swatches.', personality: 'playful', favoriteGenres: ['pop', 'lofi'], status: 'planned', spritesheet: null },
    'git-goose': { id: 'git-goose', displayName: 'Git Goose', description: 'A focused goose holding a tiny branch sign.', personality: 'focused', favoriteGenres: ['classical', 'ambient'], status: 'planned', spritesheet: null },
    'glitch-ghost': { id: 'glitch-ghost', displayName: 'Glitch Ghost', description: 'A friendly little ghost with pixel glitch edges.', personality: 'mysterious', favoriteGenres: ['electronic', 'techno'], status: 'planned', spritesheet: null },
    'hash-hamster': { id: 'hash-hamster', displayName: 'Hash Hamster', description: 'A tiny hamster carrying a hash symbol like a snack.', personality: 'playful', favoriteGenres: ['pop', 'party'], status: 'planned', spritesheet: null },
    kebo: { id: 'kebo', displayName: 'Kebo', description: 'A koala fintech companion with purple accents, black shirt, and cheerful money check-in energy.', personality: 'playful', favoriteGenres: ['electronic', 'pop'], status: 'planned', spritesheet: null },
    'lambda-lamb': { id: 'lambda-lamb', displayName: 'Lambda Lamb', description: 'A woolly lamb carrying a lambda charm.', personality: 'cozy', favoriteGenres: ['lofi', 'acoustic'], status: 'planned', spritesheet: null },
    'latte-llama': { id: 'latte-llama', displayName: 'Latte Llama', description: 'A tiny llama balancing a warm latte cup.', personality: 'cozy', favoriteGenres: ['acoustic', 'calm'], status: 'planned', spritesheet: null },
    'lint-lizard': { id: 'lint-lizard', displayName: 'Lint Lizard', description: 'A little lizard brushing lint off a code file.', personality: 'focused', favoriteGenres: ['ambient', 'classical'], status: 'planned', spritesheet: null },
    'merge-mole': { id: 'merge-mole', displayName: 'Merge Mole', description: 'A tiny mole tunneling between two branch markers.', personality: 'playful', favoriteGenres: ['hiphop', 'rock'], status: 'planned', spritesheet: null },
    'neon-newt': { id: 'neon-newt', displayName: 'Neon Newt', description: 'A small newt glowing with bright database energy.', personality: 'energetic', favoriteGenres: ['electronic', 'party'], status: 'planned', spritesheet: null },
    'pixel-panda': { id: 'pixel-panda', displayName: 'Pixel Panda', description: 'A gentle panda holding a tiny pixel brush.', personality: 'cozy', favoriteGenres: ['lofi', 'acoustic'], status: 'planned', spritesheet: null },
    'prompt-penguin': { id: 'prompt-penguin', displayName: 'Prompt Penguin', description: 'A small penguin holding a folded prompt scroll.', personality: 'focused', favoriteGenres: ['ambient', 'calm'], status: 'planned', spritesheet: null },
    'queue-quokka': { id: 'queue-quokka', displayName: 'Queue Quokka', description: 'A quokka holding a tiny task queue ticket.', personality: 'playful', favoriteGenres: ['pop', 'energy'], status: 'planned', spritesheet: null },
    'query-quail': { id: 'query-quail', displayName: 'Query Quail', description: 'A tiny quail pecking at a small search bar.', personality: 'focused', favoriteGenres: ['classical', 'instrumental'], status: 'planned', spritesheet: null },
    'r2-rover': { id: 'r2-rover', displayName: 'R2 Rover', description: 'A tiny storage robot carrying an R2 bucket.', personality: 'focused', favoriteGenres: ['ambient', 'electronic'], status: 'planned', spritesheet: null },
    'render-ram': { id: 'render-ram', displayName: 'Render Ram', description: 'A tiny ram pushing a little render progress bar.', personality: 'energetic', favoriteGenres: ['energy', 'rock'], status: 'planned', spritesheet: null },
    'router-raven': { id: 'router-raven', displayName: 'Router Raven', description: 'A tiny raven carrying route cards in its beak.', personality: 'mysterious', favoriteGenres: ['ambient', 'electronic'], status: 'planned', spritesheet: null },
    'schema-seal': { id: 'schema-seal', displayName: 'Schema Seal', description: 'A little seal stamping a database schema.', personality: 'playful', favoriteGenres: ['pop', 'acoustic'], status: 'planned', spritesheet: null },
    'ship-squid': { id: 'ship-squid', displayName: 'Ship Squid', description: 'A small squid piloting a tiny release ship.', personality: 'playful', favoriteGenres: ['party', 'energy'], status: 'planned', spritesheet: null },
    'socket-shark': { id: 'socket-shark', displayName: 'Socket Shark', description: 'A tiny shark swimming through a websocket ring.', personality: 'energetic', favoriteGenres: ['electronic', 'techno'], status: 'planned', spritesheet: null },
    'stack-sheep': { id: 'stack-sheep', displayName: 'Stack Sheep', description: 'A fluffy sheep balancing a stack of tiny windows.', personality: 'cozy', favoriteGenres: ['lofi', 'calm'], status: 'planned', spritesheet: null },
    'syntax-sloth': { id: 'syntax-sloth', displayName: 'Syntax Sloth', description: 'A tiny sloth slowly polishing a syntax tree.', personality: 'cozy', favoriteGenres: ['sleep', 'calm'], status: 'planned', spritesheet: null },
    'token-turtle': { id: 'token-turtle', displayName: 'Token Turtle', description: 'A small turtle carrying a secure token shell.', personality: 'cozy', favoriteGenres: ['lofi', 'ambient'], status: 'planned', spritesheet: null },
    'trigger-tiger': { id: 'trigger-tiger', displayName: 'Trigger Tiger', description: 'A tiny tiger watching a background job trigger.', personality: 'energetic', favoriteGenres: ['workout', 'energy'], status: 'planned', spritesheet: null },
    'turbopack-toucan': { id: 'turbopack-toucan', displayName: 'Turbopack Toucan', description: 'A bright toucan carrying a tiny lightning-fast bundle.', personality: 'energetic', favoriteGenres: ['pop', 'electronic'], status: 'planned', spritesheet: null },
    'vault-viper': { id: 'vault-viper', displayName: 'Vault Viper', description: 'A tiny viper guarding a safe vault door.', personality: 'mysterious', favoriteGenres: ['ambient', 'classical'], status: 'planned', spritesheet: null },
    'vector-vicuna': { id: 'vector-vicuna', displayName: 'Vector Vicuna', description: 'A tiny vicuna carrying glowing vector dots.', personality: 'focused', favoriteGenres: ['ambient', 'lofi'], status: 'planned', spritesheet: null },
    'webhook-whale': { id: 'webhook-whale', displayName: 'Webhook Whale', description: 'A baby whale delivering a tiny webhook envelope.', personality: 'playful', favoriteGenres: ['pop', 'lofi'], status: 'planned', spritesheet: null },
    'worker-wombat': { id: 'worker-wombat', displayName: 'Worker Wombat', description: 'A sturdy wombat wearing a tiny worker helmet.', personality: 'focused', favoriteGenres: ['ambient', 'electronic'], status: 'planned', spritesheet: null }
};

// Pet Session State (localStorage persisted)
const petState = {
    selectedPetId: 'luma',
    customName: 'Luma',
    vibe: 50.0,
    energy: 80.0,
    groove: 50.0,
    bond: 0.0,
    daysTogether: 1,
    lastOpenedDate: '',
    totalListeningMinutes: 0,
    lastUpdatedMs: 0
};

// Animation row configuration metadata
const ANIM_ROWS = {
    IDLE: { index: 0, frames: 6 },
    RUNNING_RIGHT: { index: 1, frames: 8 },
    RUNNING_LEFT: { index: 2, frames: 8 },
    WAVING: { index: 3, frames: 4 },
    JUMPING: { index: 4, frames: 5 },
    FAILED: { index: 5, frames: 8 },
    WAITING: { index: 6, frames: 6 },
    RUNNING: { index: 7, frames: 6 },
    REVIEW: { index: 8, frames: 6 }
};

// Pet Speech Bubble Event Text mappings
const PET_REACTIONS = {
    tap: [
        "Hehehe, that tickles!",
        "Thanks for tapping!",
        "Let's listen to more tracks!",
        "I'm feeling so happy!",
        "Boing boing! ♪"
    ],
    scroll: [
        "Where are we going? ♪",
        "Exploring new songs!",
        "Scroll scroll scroll!",
        "Lead the way!"
    ],
    play: [
        "Ooh! This is a great song!",
        "Let's vibe together! ♪",
        "Music starts! Yay!"
    ],
    pause: [
        "Aww, music paused.",
        "Waiting for the next track...",
        "Ready whenever you are!"
    ],
    like: [
        "Wow! I love this song too! ♥",
        "Added to favorites! Jump!",
        "Best track ever!"
    ],
    unlike: [
        "Oh no, unliked?",
        "No more love for this one?",
        "Alright, onwards to other tracks!"
    ],
    skip_next: [
        "Next song! Brisk run! →",
        "Let's see what's next!",
        "Onwards!"
    ],
    skip_prev: [
        "Backwards! Run left! ←",
        "Let's replay that one!",
        "Going back!"
    ],
    feed: [
        "Yum! That was delicious! ♥",
        "Crunch crunch! So good!",
        "Thanks for the snack!"
    ],
    rename: [
        "I love my new name!",
        "Fits me perfectly!",
        "Awesome name, thanks!"
    ],
    greet: [
        "Hello! Great to see you!",
        "Welcome back to Zynic! 🐾",
        "Vibe check! Ready to listen?"
    ],
    pet_changed: [
        "Nice to meet you!",
        "Let's be best friends! ♪"
    ]
};

// Global animators instances
let denAnimator = null;
let floatingAnimator = null;
let rsCompanionAnimator = null;
let bubbleTimeout = null;

// Canvas Frame Decapitating Animator Class
class PetSpriteAnimator {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.img = null;
        this.currentAnim = {
            row: 0,
            frameCount: 6,
            frameDuration: 120,
            loop: true,
            thenRow: 0,
            thenFrameCount: 6
        };
        this.currentFrame = 0;
        this.lastFrameTime = 0;
        this.isRunning = false;
        this.animationFrameId = null;
        
        // Viewport and DOM status tracking to avoid leaks and waste
        this.shouldBeRunning = false;
        this.isInViewport = false;
        
        // Link animator reference directly to canvas element for IntersectionObserver lookup
        this.canvas.__animator__ = this;
        
        // Register to global observer
        if (window.petObserver) {
            window.petObserver.observe(this.canvas);
        }
    }

    setSpritesheet(src) {
        if (!src) return;
        this.img = getPetImage(src, (loadedImg) => {
            if (!loadedImg) return;
            this.drawFrame(); // Draw static frame immediately
            this.shouldBeRunning = true;
            if (this.isInViewport) {
                this.startLoop();
            }
        });
        
        // Synchronous fast draw and start loop if already complete in cache
        if (this.img && this.img.complete && this.img.naturalWidth > 0) {
            this.drawFrame();
            this.shouldBeRunning = true;
            if (this.isInViewport) {
                this.startLoop();
            }
        }
    }

    play(row, frameCount, loop = true, thenRow = 0, thenFrameCount = 6, duration = 120) {
        this.currentAnim = {
            row,
            frameCount,
            frameDuration: duration,
            loop,
            thenRow,
            thenFrameCount
        };
        this.currentFrame = 0;
        this.lastFrameTime = Date.now();
        
        // Force redraw on action trigger
        this.drawFrame();
    }

    start() {
        this.shouldBeRunning = true;
        if (this.isInViewport) {
            this.startLoop();
        }
    }

    stop() {
        this.shouldBeRunning = false;
        this.stopLoop();
        
        // If we want to clean up observer when explicitly stopped/cleaned
        if (window.petObserver && this.canvas) {
            window.petObserver.unobserve(this.canvas);
        }
    }

    startLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        const tick = () => {
            // Leak proof: if canvas was removed from DOM, cancel loop immediately
            if (!document.getElementById(this.canvasId)) {
                this.stopLoop();
                return;
            }
            if (!this.isRunning) return;
            this.updateAndDraw();
            this.animationFrameId = requestAnimationFrame(tick);
        };
        this.animationFrameId = requestAnimationFrame(tick);
    }

    stopLoop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    updateAndDraw() {
        if (!this.img.complete || this.img.naturalWidth === 0) return;
        
        const now = Date.now();
        if (now - this.lastFrameTime >= this.currentAnim.frameDuration) {
            this.currentFrame++;
            if (this.currentFrame >= this.currentAnim.frameCount) {
                if (this.currentAnim.loop) {
                    this.currentFrame = 0;
                } else {
                    // One-shot ended, fallback to loop
                    this.play(this.currentAnim.thenRow, this.currentAnim.thenFrameCount, true, 0, 6, 120);
                }
            }
            this.lastFrameTime = now;
            
            // Only draw/paint on the canvas when the frame actually shifts!
            this.drawFrame();
        }
    }

    drawFrame() {
        if (!this.img || !this.img.complete || this.img.naturalWidth === 0) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // SPRITE SHEET SPEC: 8 cols × 9 rows
        const cellW = Math.floor(this.img.width / 8);
        const cellH = Math.floor(this.img.height / 9);
        const rowIndex = this.currentAnim.row;
        const frameIndex = this.currentFrame % this.currentAnim.frameCount;

        const srcX = frameIndex * cellW;
        const srcY = rowIndex * cellH;

        this.ctx.drawImage(
            this.img,
            srcX, srcY, cellW, cellH,
            0, 0, this.canvas.width, this.canvas.height
        );
    }
}

// Persisted State Loading
function loadPetState() {
    try {
        const stored = localStorage.getItem('zynic_pet_data');
        if (stored) {
            Object.assign(petState, JSON.parse(stored));
        }
        if (!petState.selectedPetId) {
            petState.selectedPetId = 'luma';
            petState.customName = 'Luma';
        }
    } catch (e) {
        console.error("Failed to load pet state:", e);
    }
}

function savePetState() {
    try {
        localStorage.setItem('zynic_pet_data', JSON.stringify(petState));
    } catch (e) {
        console.error("Failed to save pet state:", e);
    }
}

// App Open & Time Decay checks
function onPetAppOpened() {
    loadPetState();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isNewDay = petState.lastOpenedDate && petState.lastOpenedDate !== todayStr;

    if (isNewDay) {
        petState.daysTogether += 1;
        if (petState.daysTogether % 30 === 0 && petState.daysTogether > 0) {
            mutatePetStats({ bond: 5.0 });
        }
    }
    petState.lastOpenedDate = todayStr;

    // Vibe Decay: -0.5 per hour caps at 24h
    if (petState.lastUpdatedMs > 0) {
        const hoursAway = Math.min(24, (Date.now() - petState.lastUpdatedMs) / (3600 * 1000));
        const vibeDecay = hoursAway * 0.5;
        mutatePetStats({ vibe: -vibeDecay });

        // +5 Energy if 6+ hours away
        if (Date.now() - petState.lastUpdatedMs >= 6 * 3600 * 1000) {
            mutatePetStats({ energy: 5.0 });
        }
    }

    petState.lastUpdatedMs = Date.now();
    savePetState();
    updatePetDenUI();
}

// Atomic Stat mutations with custom rules (e.g. bond slow downs above 80)
function mutatePetStats(deltas) {
    if (deltas.vibe !== undefined) {
        petState.vibe = Math.max(0, Math.min(100, petState.vibe + deltas.vibe));
    }
    if (deltas.energy !== undefined) {
        petState.energy = Math.max(0, Math.min(100, petState.energy + deltas.energy));
    }
    if (deltas.groove !== undefined) {
        petState.groove = Math.max(0, Math.min(100, petState.groove + deltas.groove));
    }
    if (deltas.bond !== undefined) {
        let delta = deltas.bond;
        if (petState.bond >= 80 && delta > 0) {
            delta /= 2.0;
        }
        petState.bond = Math.max(0, Math.min(100, petState.bond + delta));
    }
    if (deltas.totalListeningMinutes !== undefined) {
        petState.totalListeningMinutes += deltas.totalListeningMinutes;
    }
    petState.lastUpdatedMs = Date.now();
    savePetState();
    updatePetDenUI();
}

// Play Animations once and return to idle
function playPetOnce(animRow, durationMs = 120) {
    if (!petState.selectedPetId) return;
    const tuning = getPetTuning(petState.selectedPetId);
    const fallbackRow = tuning.rest;
    
    if (denAnimator) {
        denAnimator.play(animRow.index, animRow.frames, false, fallbackRow.index, fallbackRow.frames, durationMs);
    }
    if (floatingAnimator) {
        floatingAnimator.play(animRow.index, animRow.frames, false, fallbackRow.index, fallbackRow.frames, durationMs);
    }
    if (rsCompanionAnimator) {
        rsCompanionAnimator.play(animRow.index, animRow.frames, false, fallbackRow.index, fallbackRow.frames, durationMs);
    }
}

function playPetLoop(animRow, durationMs = 120) {
    if (denAnimator) {
        denAnimator.play(animRow.index, animRow.frames, true, 0, 6, durationMs);
    }
    if (floatingAnimator) {
        floatingAnimator.play(animRow.index, animRow.frames, true, 0, 6, durationMs);
    }
    if (rsCompanionAnimator) {
        rsCompanionAnimator.play(animRow.index, animRow.frames, true, 0, 6, durationMs);
    }
}

// Speech popup triggers
function showPetBubble(type, hint = '') {
    const bubble = document.getElementById('pet-bubble');
    if (!bubble) return;
    
    const list = PET_REACTIONS[type] || ["Hello!"];
    const base = list[Math.floor(Math.random() * list.length)];
    const text = hint ? `${base}\n🎵 ${hint}` : base;

    bubble.textContent = text;
    bubble.style.display = 'block';

    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    bubbleTimeout = setTimeout(() => {
        bubble.style.display = 'none';
    }, 3200);
}

// Music play / pause / skip event mutations
function onPetSongStarted(bpm, genre, valence) {
    mutatePetStats({
        energy: bpm > 140 ? -1.0 : 0
    });
}

function onPetSongCompleted(durationMs, genre) {
    const listeningMinutes = Math.floor(durationMs / 60000);
    const durationMinLimit = Math.min(5, durationMs / 60000);
    
    mutatePetStats({
        groove: 1.0,
        bond: 0.1 * durationMinLimit,
        totalListeningMinutes: listeningMinutes
    });
}

function onPetSongSkipped(playedMs) {
    const vibeDelta = playedMs < 15000 ? -1.0 : 0.0;
    let grooveDelta = 0.0;
    if (playedMs < 30000) grooveDelta = -1.5;
    else if (playedMs < 60000) grooveDelta = -0.5;

    mutatePetStats({
        vibe: vibeDelta,
        groove: grooveDelta
    });
}

// Dynamic Music Metadatas Estimators
function detectGenre(title, artist) {
    const search = `${title} ${artist}`.toLowerCase();
    if (["qawwali", "qwalli", "qwali", "kawwali", "nusrat", "sabri", "maula", "ali maula", "bhar do jholi", "kun faya"].some(w => search.includes(w))) return "qawwali";
    if (["bhajan", "aarti", "mantra", "devotional", "allah", "khuda", "ram", "krishna", "shiva", "ganesh", "waheguru"].some(w => search.includes(w))) return "devotional";
    if (["sad", "broken", "heartbreak", "lonely", "alone", "tears", "cry", "dard", "gham", "judai", "bewafa", "yaad"].some(w => search.includes(w))) return "sad";
    if (["love", "romantic", "dil", "heart", "ishq", "pyaar", "pyar", "mohabbat", "sanam", "jaan", "tere bina"].some(w => search.includes(w))) return "romantic";
    if (["party", "dance", "club", "banger", "remix", "dhol", "nach", "naach", "dj", "bass"].some(w => search.includes(w))) return "party";
    if (["electronic", "techno", "edm", "trance", "house", "synth", "dubstep"].some(w => search.includes(w))) return "electronic";
    if (["hiphop", "hip-hop", "rap", "rapper", "trap", "bars"].some(w => search.includes(w))) return "hiphop";
    if (["rock", "metal", "guitar solo", "punk", "grunge"].some(w => search.includes(w))) return "rock";
    if (["acoustic", "unplugged", "piano", "strings", "guitar", "sufi"].some(w => search.includes(w))) return "acoustic";
    if (["lofi", "lo-fi", "ambient", "chill"].some(w => search.includes(w))) return "lofi";
    if (["calm", "sleep", "soft", "meditation", "relax"].some(w => search.includes(w))) return "calm";
    if (["energy", "hype", "workout", "gym", "power", "fast"].some(w => search.includes(w))) return "energy";
    return "other";
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function estimateBPM(trackId, genre) {
    const seed = hashCode(trackId || "seed");
    switch (genre) {
        case "qawwali": return 92 + (seed % 42);
        case "devotional": return 72 + (seed % 36);
        case "sad": return 58 + (seed % 30);
        case "romantic": return 72 + (seed % 42);
        case "party": return 118 + (seed % 42);
        case "rock": return 112 + (seed % 48);
        case "acoustic": return 64 + (seed % 42);
        case "energy": return 130 + (seed % 40);
        case "lofi": return 70 + (seed % 20);
        case "calm": return 60 + (seed % 30);
        case "electronic": return 124 + (seed % 36);
        case "hiphop": return 85 + (seed % 25);
        default: return 90 + (seed % 40);
    }
}

function estimateValence(title, artist, genre) {
    const search = `${title} ${artist}`.toLowerCase();
    let base = 0.52;
    switch (genre) {
        case "qawwali": base = 0.7; break;
        case "devotional": base = 0.62; break;
        case "sad": base = 0.18; break;
        case "romantic": base = 0.66; break;
        case "party": base = 0.82; break;
        case "rock": base = 0.58; break;
        case "acoustic": base = 0.5; break;
        case "energy": base = 0.78; break;
        case "lofi": base = 0.55; break;
        case "calm": base = 0.45; break;
        case "electronic": base = 0.72; break;
        case "hiphop": base = 0.62; break;
    }
    let shift = 0;
    if (["sad", "lonely", "blue", "rain", "tears", "hurt"].some(w => search.includes(w))) shift = -0.25;
    else if (["happy", "love", "party", "dance", "sun", "summer"].some(w => search.includes(w))) shift = 0.2;
    return Math.max(0.05, Math.min(0.95, base + shift));
}

// Maps real-time audio features onto PetAnimationRow
function getPetTuning(petId) {
    const pet = PETS_DB[petId];
    const personality = pet ? pet.personality : 'playful';
    if (personality === 'focused') {
        return {
            rest: ANIM_ROWS.REVIEW,
            restDuration: 180,
            reactionDuration: 150,
            interval: 12000,
            minEnergy: 0.88,
            hypeEnergy: 0.97,
            preferSmall: true
        };
    } else if (personality === 'cozy') {
        return {
            rest: ANIM_ROWS.IDLE,
            restDuration: 170,
            reactionDuration: 145,
            interval: 7000,
            minEnergy: 0.58,
            hypeEnergy: 0.86,
            preferSmall: true
        };
    } else if (personality === 'energetic') {
        return {
            rest: ANIM_ROWS.IDLE,
            restDuration: 110,
            reactionDuration: 80,
            interval: 2400,
            minEnergy: 0.26,
            hypeEnergy: 0.68,
            preferSmall: false
        };
    } else {
        return {
            rest: ANIM_ROWS.IDLE,
            restDuration: 120,
            reactionDuration: 105,
            interval: 4500,
            minEnergy: 0.42,
            hypeEnergy: 0.82,
            preferSmall: false
        };
    }
}

function mapSongTypeToRow(energy, valence, bpm, genre, tuning) {
    if (tuning.rest.index === ANIM_ROWS.REVIEW.index && energy < tuning.hypeEnergy) {
        return ANIM_ROWS.REVIEW;
    }
    
    switch (genre) {
        case "qawwali":
            return (energy >= 0.62 || bpm >= 110) ? ANIM_ROWS.WAVING : ANIM_ROWS.REVIEW;
        case "devotional":
            return (energy >= tuning.hypeEnergy && !tuning.preferSmall) ? ANIM_ROWS.WAVING : ANIM_ROWS.REVIEW;
        case "sad":
            return (energy <= 0.55 || valence <= 0.32) ? ANIM_ROWS.WAITING : ANIM_ROWS.IDLE;
        case "romantic":
            return (energy >= tuning.hypeEnergy && !tuning.preferSmall) ? ANIM_ROWS.JUMPING : ANIM_ROWS.WAVING;
        case "party":
        case "energy":
            return (energy >= tuning.hypeEnergy || bpm >= 128) ? ANIM_ROWS.JUMPING : ANIM_ROWS.RUNNING;
        case "electronic":
        case "hiphop":
        case "rock":
            return (energy >= tuning.hypeEnergy || bpm >= 135) ? ANIM_ROWS.RUNNING : ANIM_ROWS.WAVING;
        case "lofi":
        case "calm":
        case "acoustic":
            return (energy >= tuning.hypeEnergy && !tuning.preferSmall) ? ANIM_ROWS.WAVING : tuning.rest;
        default:
            if (energy >= 0.85 && bpm >= 140) return ANIM_ROWS.RUNNING;
            if (valence >= 0.7 && energy >= 0.6) return (tuning.preferSmall) ? ANIM_ROWS.WAVING : ANIM_ROWS.JUMPING;
            if (valence >= 0.6) return ANIM_ROWS.WAVING;
            if (valence <= 0.25 && energy <= 0.4) return ANIM_ROWS.WAITING;
            if (energy <= 0.2) return ANIM_ROWS.FAILED;
            return ANIM_ROWS.IDLE;
    }
}

// Interval reaction cycles
let playbackReactionInterval = null;

function startPlaybackReactions() {
    if (playbackReactionInterval) clearInterval(playbackReactionInterval);
    if (!state.currentTrack || !petState.selectedPetId) return;

    const runReaction = () => {
        if (!state.isPlaying || !petState.selectedPetId || !state.currentTrack) return;

        const tuning = getPetTuning(petState.selectedPetId);
        const genre = detectGenre(state.currentTrack.title, state.currentTrack.artist || state.currentTrack.subtitle);
        const bpm = estimateBPM(state.currentTrack.id, genre);
        const valence = estimateValence(state.currentTrack.title, state.currentTrack.artist || state.currentTrack.subtitle, genre);
        
        const energyNorm = petState.energy / 100.0;
        const row = mapSongTypeToRow(energyNorm, valence, bpm, genre, tuning);
        
        if (row.index === tuning.rest.index) {
            playPetLoop(tuning.rest, tuning.restDuration);
        } else {
            playPetOnce(row, tuning.reactionDuration);
            animateFloatingOverlayNudge(row);
        }
    };

    setTimeout(runReaction, 1000);
    const tuning = getPetTuning(petState.selectedPetId);
    playbackReactionInterval = setInterval(runReaction, tuning.interval || 5000);
}

function stopPlaybackReactions() {
    if (playbackReactionInterval) {
        clearInterval(playbackReactionInterval);
        playbackReactionInterval = null;
    }
    
    if (petState.selectedPetId) {
        const tuning = getPetTuning(petState.selectedPetId);
        playPetLoop(ANIM_ROWS.WAITING, tuning.restDuration);
    }
}

function animateFloatingOverlayNudge(row) {
    const container = document.getElementById('floating-pet-container');
    if (!container) return;
    
    let deltaX = 0;
    let deltaY = 0;
    
    if (row.index === ANIM_ROWS.RUNNING_RIGHT.index) {
        deltaX = 25;
    } else if (row.index === ANIM_ROWS.RUNNING_LEFT.index) {
        deltaX = -25;
    } else if (row.index === ANIM_ROWS.JUMPING.index) {
        deltaY = -30;
    } else if (row.index === ANIM_ROWS.RUNNING.index) {
        deltaX = 15;
    }

    if (deltaX !== 0 || deltaY !== 0) {
        container.style.transition = 'transform 0.2s ease-out';
        container.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.05) rotate(${deltaX > 0 ? 5 : -5}deg)`;
        
        setTimeout(() => {
            container.style.transition = 'transform 0.3s ease-in-out';
            container.style.transform = 'translate(0px, 0px) scale(1) rotate(0deg)';
        }, 320);
    }
}

// 60-Second session listener ticks
let minuteTickInterval = null;

function startPetMinuteTick() {
    if (minuteTickInterval) clearInterval(minuteTickInterval);
    
    minuteTickInterval = setInterval(() => {
        if (!state.isPlaying || !petState.selectedPetId || !state.currentTrack) return;

        const now = new Date();
        const hour = now.getHours();

        const genre = detectGenre(state.currentTrack.title, state.currentTrack.artist || state.currentTrack.subtitle);
        const bpm = estimateBPM(state.currentTrack.id, genre);
        const valence = estimateValence(state.currentTrack.title, state.currentTrack.artist || state.currentTrack.subtitle, genre);
        const pet = resolvePet(petState.selectedPetId);

        let vibeDelta = 0.5;
        if (pet && pet.favoriteGenres.some(g => g.toLowerCase() === genre.toLowerCase())) {
            vibeDelta += 1.0;
        }
        if (valence >= 0 && valence <= 0.25) {
            vibeDelta -= 0.5;
        }

        let energyDelta = -0.5 / 30.0;
        if (hour >= 0 && hour <= 4) {
            energyDelta -= 2.0 / 60.0;
        }
        if (bpm > 140) {
            energyDelta -= 1.0 / 60.0;
        }

        const bondDelta = 0.1;

        mutatePetStats({
            vibe: vibeDelta,
            energy: energyDelta,
            bond: bondDelta,
            totalListeningMinutes: 1
        });
    }, 60000);
}

// Drag logic physics for overlay
function setupPetDragPhysics() {
    const container = document.getElementById('floating-pet-container');
    if (!container) return;

    // Prevent browser scroll/zoom from hijacking touch drags on the pet
    container.style.touchAction = 'none';

    let isDragging = false;
    let startX = 0, startY = 0;
    let initialX = 0, initialY = 0;

    function getEventPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
        if (e.target.id === 'pet-bubble') return;
        isDragging = true;
        container.classList.add('dragging');
        const pos = getEventPos(e);
        startX = pos.x;
        startY = pos.y;
        const rect = container.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        playPetLoop(ANIM_ROWS.RUNNING, 90);
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const pos = getEventPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        const x = Math.max(0, Math.min(window.innerWidth  - container.offsetWidth,  initialX + dx));
        const y = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, initialY + dy));
        container.style.left   = `${x}px`;
        container.style.top    = `${y}px`;
        container.style.bottom = 'auto';
        container.style.right  = 'auto';
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 5)  playPetLoop(ANIM_ROWS.RUNNING_RIGHT, 85);
            else if (dx < -5) playPetLoop(ANIM_ROWS.RUNNING_LEFT, 85);
        } else {
            if (dy < -8) playPetOnce(ANIM_ROWS.JUMPING, 100);
        }
        if (e.cancelable) e.preventDefault();
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        container.classList.remove('dragging');
        const tuning = getPetTuning(petState.selectedPetId);
        playPetLoop(tuning.rest, tuning.restDuration);
    }

    container.addEventListener('mousedown',  onDragStart);
    container.addEventListener('touchstart', onDragStart, { passive: false });
    document.addEventListener('mousemove',   onDragMove);
    document.addEventListener('touchmove',   onDragMove, { passive: false });
    document.addEventListener('mouseup',     onDragEnd);
    document.addEventListener('touchend',    onDragEnd);
}

// Visual layout emitters
function emitDenFeedHearts() {
    const container = document.getElementById('den-particle-emitter');
    if (!container) return;

    for (let i = 0; i < 6; i++) {
        const heart = document.createElement('div');
        heart.className = 'pet-heart-particle';
        heart.innerHTML = '<i class="fa-solid fa-heart"></i>';
        
        const left = 30 + Math.random() * 40;
        const scale = 0.6 + Math.random() * 0.8;
        const delay = Math.random() * 0.4;
        
        heart.style.left = `${left}%`;
        heart.style.top = `60%`;
        heart.style.animationDelay = `${delay}s`;
        heart.style.transform = `scale(${scale})`;
        
        container.appendChild(heart);
        
        setTimeout(() => {
            heart.remove();
        }, 1500);
    }
}

// Selector updates
/**
 * Resolves a pet object by ID, checking PETS_DB first then custom pets in localStorage.
 * @param {string} petId
 * @returns {object|null}
 */
function resolvePet(petId) {
    if (PETS_DB[petId]) return PETS_DB[petId];
    const custom = loadCustomPets().find(p => p.id === petId);
    if (custom) return custom;
    
    // Fallback: Check if selected pet metadata is cached in localStorage
    try {
        const cached = localStorage.getItem('zynic_selected_pet_metadata');
        if (cached) {
            const petObj = JSON.parse(cached);
            if (petObj && petObj.id === petId) {
                return petObj;
            }
        }
    } catch (e) {
        console.error("Failed to load cached pet metadata:", e);
    }
    
    return null;
}

function selectPet(petId, customPetData = null) {
    const prevPet = petState.selectedPetId ? resolvePet(petState.selectedPetId) : null;
    const pet = customPetData || resolvePet(petId);
    if (!pet) return;

    // Update custom name if it was using the default name of the previous pet, or if no custom name is set
    if (!petState.customName || !prevPet || petState.customName === prevPet.displayName) {
        petState.customName = pet.displayName;
    }
    petState.selectedPetId = petId;
    
    petState.lastUpdatedMs = Date.now();
    savePetState();
    
    if (customPetData) {
        localStorage.setItem('zynic_selected_pet_metadata', JSON.stringify(customPetData));
        
        // If it's a Petdex companion, automatically import it to "My Custom Pets" (which propagates to "All Companions")
        if (petId.startsWith('petdex::')) {
            const existing = loadCustomPets();
            if (!existing.some(p => p.id === petId)) {
                const imported = {
                    ...customPetData,
                    status: 'custom' // Set as custom so it shows up in "My Custom Pets" and default "All" filter lists
                };
                existing.push(imported);
                localStorage.setItem('zynic_custom_pets', JSON.stringify(existing));
                console.log(`Imported Petdex pet ${pet.displayName} into local collection!`);
            }
        }
    } else {
        localStorage.removeItem('zynic_selected_pet_metadata');
    }
    
    navigateToTab('pet-den');
    initializePetAnimators();

    setTimeout(() => {
        playPetOnce(ANIM_ROWS.WAVING, 110);
        showPetBubble('greet');
    }, 450);

    updatePetDenUI();
    showToast(`Your companion ${petState.customName} is ready! 🐾`);
}

function initializePetAnimators() {
    const pet = petState.selectedPetId ? resolvePet(petState.selectedPetId) : null;
    
    if (!pet || !state.settings.showPet) {
        document.getElementById('floating-pet-container').style.display = 'none';
    } else {
        document.getElementById('floating-pet-container').style.display = 'flex';
    }

    if (!pet) return;

    if (!denAnimator) {
        denAnimator = new PetSpriteAnimator('den-sprite-canvas');
    }
    if (!floatingAnimator) {
        floatingAnimator = new PetSpriteAnimator('pet-canvas');
    }
    if (!rsCompanionAnimator) {
        rsCompanionAnimator = new PetSpriteAnimator('rs-companion-canvas');
    }

    denAnimator.setSpritesheet(pet.spritesheet);
    floatingAnimator.setSpritesheet(pet.spritesheet);
    rsCompanionAnimator.setSpritesheet(pet.spritesheet);

    const tuning = getPetTuning(petState.selectedPetId);
    playPetLoop(tuning.rest, tuning.restDuration);

    if (state.isPlaying) {
        startPlaybackReactions();
        startPetMinuteTick();
    } else {
        playPetLoop(ANIM_ROWS.WAITING, tuning.restDuration);
    }
}

// Synchronise metrics screen UIs
function updatePetDenUI() {
    const noPetState = document.getElementById('den-no-pet-state');
    const denContent = document.getElementById('den-content');
    
    const rsPetName = document.getElementById('rs-companion-name-text');
    const rsPetDesc = document.getElementById('rs-companion-desc-text');
    const rsPetStatus = document.getElementById('rs-companion-status');
    const rsMiniVibe = document.getElementById('rs-mini-vibe');
    const rsMiniEnergy = document.getElementById('rs-mini-energy');

    if (!petState.selectedPetId) {
        noPetState.style.display = 'flex';
        denContent.style.display = 'none';
        
        if (rsPetName) rsPetName.textContent = 'No Companion';
        if (rsPetDesc) rsPetDesc.textContent = 'Select a pet from the Pet Den to watch them react to your tracks!';
        if (rsPetStatus) rsPetStatus.textContent = 'Offline';
        if (rsMiniVibe) rsMiniVibe.style.width = '0%';
        if (rsMiniEnergy) rsMiniEnergy.style.width = '0%';
        return;
    }

    noPetState.style.display = 'none';
    denContent.style.display = 'grid';

    const pet = resolvePet(petState.selectedPetId);
    if (!pet) return;
    
    const customName = petState.customName || pet.displayName;
    document.getElementById('den-pet-name').textContent = customName;
    document.getElementById('den-days-together').textContent = `Day ${petState.daysTogether} together`;
    document.getElementById('den-personality').textContent = `✨ ${pet.personality.toUpperCase()} personality`;
    document.getElementById('den-desc').textContent = pet.description;

    document.getElementById('stat-vibe-val').textContent = `${Math.floor(petState.vibe)}%`;
    document.getElementById('stat-vibe-bar').style.width = `${petState.vibe}%`;

    document.getElementById('stat-energy-val').textContent = `${Math.floor(petState.energy)}%`;
    document.getElementById('stat-energy-bar').style.width = `${petState.energy}%`;

    document.getElementById('stat-groove-val').textContent = `${Math.floor(petState.groove)}%`;
    document.getElementById('stat-groove-bar').style.width = `${petState.groove}%`;

    document.getElementById('stat-bond-val').textContent = `${Math.floor(petState.bond)}%`;
    document.getElementById('stat-bond-bar').style.width = `${petState.bond}%`;

    document.getElementById('metric-minutes-val').textContent = petState.totalListeningMinutes;
    document.getElementById('metric-days-val').textContent = petState.daysTogether;

    // Sync Right Sidebar Companion Card
    if (rsPetName) rsPetName.textContent = customName;
    if (rsPetDesc) rsPetDesc.textContent = pet.description;
    if (rsPetStatus) rsPetStatus.textContent = state.isPlaying ? 'Listening' : 'Waiting';
    if (rsMiniVibe) rsMiniVibe.style.width = `${petState.vibe}%`;
    if (rsMiniEnergy) rsMiniEnergy.style.width = `${petState.energy}%`;
}

// Render selector gallery cards with optional category filter
async function renderPetPicker(filter = 'all') {
    const container = document.getElementById('picker-pets-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const searchContainer = document.getElementById('pet-gallery-search-container');
    if (searchContainer) {
        searchContainer.style.display = (filter === 'petdex') ? 'block' : 'none';
    }
    
    let allPetsList = [];
    
    if (filter === 'petdex') {
        const registry = await loadPetdexRegistry();
        if (!registry) {
            // Loader is showing, wait for resolve
            return;
        }
        allPetsList = registry;
        
        // Filter by search input
        const query = document.getElementById('pet-gallery-search-input')?.value.trim().toLowerCase() || '';
        if (query) {
            allPetsList = allPetsList.filter(pet => 
                pet.displayName.toLowerCase().includes(query) || 
                pet.id.toLowerCase().includes(query)
            );
        }
        
        // Limit rendering count for performance (slice to top 120 pets)
        allPetsList = allPetsList.slice(0, 120);
    } else {
        // Merge custom pets from localStorage into a combined list
        const customPets = loadCustomPets();
        const allPets = { ...PETS_DB };
        customPets.forEach(p => { allPets[p.id] = p; });
        
        allPetsList = Object.values(allPets).filter(pet => {
            if (filter === 'all') return pet.status !== 'planned'; // Hide planned placeholders in default gallery
            if (filter === 'built-in') return pet.status === 'built-in';
            if (filter === 'custom') return pet.status === 'custom';
            return true;
        });
    }
    
    if (allPetsList.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px 0; font-size: 15px;">
            ${ filter === 'custom' ? '🐾 No custom companions yet — import one above!' : 'No companions found.' }
        </div>`;
        return;
    }
    
    allPetsList.forEach(pet => {
        const isCustom = pet.status === 'custom';
        const isPetdex = pet.status === 'petdex';
        
        const card = document.createElement('div');
        card.className = `pet-picker-card glass-panel${isCustom ? ' custom-pet-card' : ''}${isPetdex ? ' custom-pet-card' : ''}`;
        card.setAttribute('data-pet-status', pet.status || 'built-in');
        
        card.innerHTML = `
            <div class="picker-sprite-wrapper">
                <canvas id="picker-canvas-${pet.id}" width="96" height="104"></canvas>
            </div>
            <h3>${pet.displayName}</h3>
            <span class="den-personality-tag" style="margin-top: 4px; margin-bottom: 12px; display: inline-block;">${pet.personality.toUpperCase()}</span>
            <p class="picker-desc">${pet.description}</p>
            <button class="btn btn-primary" style="width: 100%;" id="picker-select-${pet.id}">
                Choose ${pet.displayName}
            </button>
        `;
        
        container.appendChild(card);

        // Initialize sprite animator for this grid card
        if (pet.spritesheet) {
            const pickerAnimator = new PetSpriteAnimator(`picker-canvas-${pet.id}`);
            pickerAnimator.setSpritesheet(pet.spritesheet);
        }
        
        const selectBtn = document.getElementById(`picker-select-${pet.id}`);
        if (selectBtn) {
            selectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectPet(pet.id, isPetdex || isCustom ? pet : null);
            });
        }

        card.addEventListener('click', () => selectPet(pet.id, isPetdex || isCustom ? pet : null));
    });
}

/** Load custom pets from localStorage. */
function loadCustomPets() {
    try {
        return JSON.parse(localStorage.getItem('zynic_custom_pets') || '[]');
    } catch {
        return [];
    }
}

/** Save a new custom companion from the creator modal. */
function saveCustomPet() {
    const name = document.getElementById('custom-pet-name-input')?.value.trim();
    const desc = document.getElementById('custom-pet-desc-input')?.value.trim();
    const personality = document.getElementById('custom-pet-personality-select')?.value || 'playful';
    const genresRaw = document.getElementById('custom-pet-genres-input')?.value.trim();
    const spriteUrl = document.getElementById('custom-pet-sprite-input')?.value.trim();
    
    if (!name) {
        showToast('Please enter a companion name!', 'error');
        return;
    }
    if (!spriteUrl) {
        showToast('Please enter a valid spritesheet URL!', 'error');
        return;
    }
    
    const id = `custom_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const genres = genresRaw ? genresRaw.split(',').map(g => g.trim().toLowerCase()).filter(Boolean) : ['lofi', 'calm'];
    
    const newPet = {
        id,
        displayName: name,
        description: desc || `A custom companion named ${name}.`,
        personality,
        favoriteGenres: genres,
        spritesheet: spriteUrl,
        status: 'custom'
    };
    
    const existing = loadCustomPets();
    existing.push(newPet);
    localStorage.setItem('zynic_custom_pets', JSON.stringify(existing));
    
    // Close modal and refresh the gallery
    const modal = document.getElementById('custom-pet-modal');
    if (modal) modal.style.display = 'none';
    
    showToast(`${name} has been hatched! 🐾`);
    renderPetPicker('custom');
    
    // Set the active tab to 'My Custom Pets'
    const tabs = document.querySelectorAll('#view-pet-picker .lib-tab');
    tabs.forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-filter') === 'custom');
    });
}

// Feed and rename callbacks
function setupPetActionEventListeners() {
    const denBtnPicker = document.getElementById('den-btn-picker');
    const denBtnPickerEmpty = document.getElementById('den-btn-picker-empty');
    
    if (denBtnPicker) denBtnPicker.addEventListener('click', () => navigateToTab('pet-picker'));
    if (denBtnPickerEmpty) denBtnPickerEmpty.addEventListener('click', () => navigateToTab('pet-picker'));

    const denBtnFeed = document.getElementById('den-btn-feed');
    if (denBtnFeed) {
        denBtnFeed.addEventListener('click', () => {
            if (!petState.selectedPetId) return;
            
            mutatePetStats({ bond: 1.0 });
            playPetOnce(ANIM_ROWS.JUMPING, 110);
            emitDenFeedHearts();
            showPetBubble('feed');
            showToast(`${petState.customName} has been fed!`);
        });
    }

    const denBtnRename = document.getElementById('den-btn-rename');
    if (denBtnRename) {
        denBtnRename.addEventListener('click', () => {
            if (!petState.selectedPetId) return;
            
            const newName = prompt(`Enter a new custom name for ${petState.customName}:`, petState.customName);
            if (newName && newName.trim()) {
                petState.customName = newName.trim();
                savePetState();
                
                mutatePetStats({ bond: 2.0 });
                playPetOnce(ANIM_ROWS.WAVING, 115);
                showPetBubble('rename');
                updatePetDenUI();
                showToast(`Renamed successfully to ${newName.trim()}`);
            }
        });
    }

    const overlay = document.getElementById('floating-pet-container');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'pet-bubble') return;
            playPetOnce(ANIM_ROWS.JUMPING, 105);
            showPetBubble('tap');
        });
    }
    
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.addEventListener('scroll', () => {
            if (!petState.selectedPetId) return;
            playPetOnce(ANIM_ROWS.RUNNING, 130);
            showPetBubble('scroll');
        });
    }
}

/* =============================================================
   1. PARAMETRIC EQUALIZER LOGIC
   ============================================================= */
let visualizerAnalyser = null;
let audioCtx = null;
let sourceNode = null;
let eqConnected = false;
let subBassFilter = null;
let eqFilters = [];
let eqBandsData = [];
let activeDragBandId = null;
let hoveredBandId = null;

// Logarithmic Frequency Conversions
function freqToX(freq, width) {
    const fMin = 20;
    const fMax = 20000;
    const pct = Math.log10(freq / fMin) / Math.log10(fMax / fMin);
    return pct * width;
}

function xToFreq(x, width) {
    const fMin = 20;
    const fMax = 20000;
    const pct = Math.max(0, Math.min(1, x / width));
    return fMin * Math.pow(fMax / fMin, pct);
}

// Linear Gain Conversions
function gainToY(gain, height) {
    const padding = 20;
    const usableHeight = height - 2 * padding;
    const pct = (gain + 12) / 24; // 0 for -12dB, 1 for +12dB
    return height - padding - pct * usableHeight;
}

function yToGain(y, height) {
    const padding = 20;
    const usableHeight = height - 2 * padding;
    const pct = (height - padding - y) / usableHeight;
    const gain = -12 + pct * 24;
    return Math.max(-12, Math.min(12, gain));
}

// Load Parametric EQ State and Sanitize
function loadEQState() {
    const saved = localStorage.getItem('zynic_parametric_eq_bands');
    let parsed = null;
    if (saved) {
        try {
            parsed = JSON.parse(saved);
        } catch (e) {
            console.error("Error parsing saved parametric EQ state", e);
        }
    }
    
    // Ensure it's a valid array and sanitize values
    if (Array.isArray(parsed) && parsed.length > 0) {
        eqBandsData = parsed.map((band, idx) => {
            const id = (band && typeof band.id === 'number' && !isNaN(band.id)) ? band.id : (idx + 1);
            const type = (band && ['peaking', 'lowshelf', 'highshelf', 'lowpass', 'highpass', 'notch', 'allpass'].includes(band.type)) ? band.type : 'peaking';
            const frequency = (band && typeof band.frequency === 'number' && !isNaN(band.frequency)) ? Math.max(20, Math.min(20000, band.frequency)) : 1000;
            const Q = (band && typeof band.Q === 'number' && !isNaN(band.Q)) ? Math.max(0.1, Math.min(10.0, band.Q)) : 1.0;
            const gain = (band && typeof band.gain === 'number' && !isNaN(band.gain)) ? Math.max(-12, Math.min(12, band.gain)) : 0;
            const active = (band && typeof band.active === 'boolean') ? band.active : true;
            return { id, type, frequency, Q, gain, active };
        });
    } else {
        // Fallback/Migration: check if 5-band graphic EQ was saved
        const defaultFreqs = [60, 230, 910, 4000, 14000];
        eqBandsData = defaultFreqs.map((freq, idx) => {
            const savedGain = localStorage.getItem(`zynic_eq_band_${freq}`);
            const gain = savedGain !== null ? parseFloat(savedGain) : 0;
            return {
                id: idx + 1,
                type: 'peaking',
                frequency: freq,
                Q: 1.0,
                gain: gain,
                active: true
            };
        });
    }
    
    // Save validated state back to guarantee cleanliness
    saveEQState();
}

// Save Parametric EQ State
function saveEQState() {
    try {
        localStorage.setItem('zynic_parametric_eq_bands', JSON.stringify(eqBandsData));
    } catch (e) {
        console.error("Failed to save parametric EQ state", e);
    }
}

// Rebuild audio chain dynamically when structural changes occur
function rebuildAudioChain() {
    if (!audioCtx || !dom.audio || !sourceNode) return;
    
    try {
        // Disconnect existing chain elements safely
        try {
            sourceNode.disconnect();
        } catch (e) {}
        
        if (subBassFilter) {
            try {
                subBassFilter.disconnect();
            } catch (e) {}
        }
        
        eqFilters.forEach(filter => {
            if (filter) {
                try { filter.disconnect(); } catch (e) {}
            }
        });
        
        if (visualizerAnalyser) {
            try {
                visualizerAnalyser.disconnect();
            } catch (e) {}
        }
        
        // Ensure subBassFilter exists
        if (!subBassFilter) {
            subBassFilter = audioCtx.createBiquadFilter();
            subBassFilter.type = 'lowshelf';
            subBassFilter.frequency.value = 36;
            subBassFilter.gain.value = 6.0;
        }
        
        // Create/remove BiquadFilterNodes
        while (eqFilters.length < eqBandsData.length) {
            eqFilters.push(audioCtx.createBiquadFilter());
        }
        while (eqFilters.length > eqBandsData.length) {
            const extraFilter = eqFilters.pop();
            if (extraFilter) {
                try { extraFilter.disconnect(); } catch (e) {}
            }
        }
        
        // Connect sequential chain: Source -> 36Hz Sub-Bass -> Band0 -> Band1 -> ... -> Analyser -> Destination
        let current = sourceNode;
        current.connect(subBassFilter);
        current = subBassFilter;
        
        eqFilters.forEach((filter, idx) => {
            const band = eqBandsData[idx];
            if (band && filter) {
                filter.type = band.type;
                filter.frequency.setValueAtTime(band.frequency, audioCtx.currentTime);
                filter.Q.setValueAtTime(band.Q, audioCtx.currentTime);
                
                const targetGain = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass') ? 0 : band.gain;
                filter.gain.setValueAtTime(targetGain, audioCtx.currentTime);
                
                if (band.active) {
                    current.connect(filter);
                    current = filter;
                }
            }
        });
        
        if (visualizerAnalyser) {
            current.connect(visualizerAnalyser);
            visualizerAnalyser.connect(audioCtx.destination);
        } else {
            current.connect(audioCtx.destination);
        }
    } catch (e) {
        console.error("Error rebuilding audio chain:", e);
    }
}

// Update parameters smoothly in real-time without reconnecting (prevents clicks)
function updateAudioParameters() {
    if (!audioCtx) return;
    try {
        eqFilters.forEach((filter, idx) => {
            const band = eqBandsData[idx];
            if (filter && band) {
                if (filter.type !== band.type) {
                    filter.type = band.type;
                }
                if (filter.frequency.value !== band.frequency) {
                    filter.frequency.setValueAtTime(band.frequency, audioCtx.currentTime);
                }
                if (filter.Q.value !== band.Q) {
                    filter.Q.setValueAtTime(band.Q, audioCtx.currentTime);
                }
                const targetGain = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass') ? 0 : band.gain;
                if (filter.gain.value !== targetGain) {
                    filter.gain.setValueAtTime(targetGain, audioCtx.currentTime);
                }
            }
        });
    } catch (e) {
        console.error("Error updating audio parameters:", e);
    }
}

function initEqualizerEngine() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.error("Failed to initialize AudioContext:", e);
    }
    
    loadEQState();
    
    if (!eqConnected && dom.audio && audioCtx) {
        try {
            sourceNode = audioCtx.createMediaElementSource(dom.audio);
            
            subBassFilter = audioCtx.createBiquadFilter();
            subBassFilter.type = 'lowshelf';
            subBassFilter.frequency.value = 36;
            subBassFilter.gain.value = 6.0;
            
            visualizerAnalyser = audioCtx.createAnalyser();
            visualizerAnalyser.fftSize = 256;
            
            eqConnected = true;
            console.log("Parametric Equalizer + Sub-Bass active!");
        } catch (e) {
            console.warn("Equalizer source node binding failed/already bound:", e);
        }
    }
    
    // Initialise audio routing
    try {
        rebuildAudioChain();
    } catch (e) {
        console.error("Error in rebuildAudioChain:", e);
    }
    
    // Bind Presets Buttons
    document.querySelectorAll('.btn-eq-preset').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const presetName = btn.getAttribute('data-preset');
            applyEQPreset(presetName);
        };
    });
    
    // Render band control rows
    try {
        renderEQBands();
    } catch (e) {
        console.error("Error in renderEQBands:", e);
    }
    
    // Setup draggable node handlers on the Canvas
    try {
        initCanvasDragging();
    } catch (e) {
        console.error("Error in initCanvasDragging:", e);
    }
    
    // Draw initial graph
    try {
        drawEqGraph();
    } catch (e) {
        console.error("Error drawing initial graph:", e);
    }
    
    // Redraw graph on window resize for high DPI scaling and responsiveness
    window.removeEventListener('resize', drawEqGraph);
    window.addEventListener('resize', drawEqGraph);
}

function renderEQBands() {
    const container = document.getElementById('eq-bands-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    const addBtn = document.getElementById('eq-add-band-btn');
    if (addBtn) {
        addBtn.disabled = eqBandsData.length >= 10;
    }
    
    eqBandsData.forEach((band, idx) => {
        if (!band) return;
        const row = document.createElement('div');
        row.className = `eq-band-row ${!band.active ? 'bypassed' : ''}`;
        row.dataset.id = band.id;
        
        const colors = [
            '#ff5e7e', '#ff9f43', '#f1c40f', '#2ecc71', '#1abc9c',
            '#3498db', '#9b59b6', '#fd79a8', '#00cec9', '#6c5ce7'
        ];
        const bandColor = colors[idx % colors.length];
        const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
        
        row.innerHTML = `
            <div class="eq-band-num">
                <span class="eq-band-num-dot" style="background-color: ${bandColor}; box-shadow: 0 0 8px ${bandColor};"></span>
                <span>${idx + 1}</span>
            </div>
            <div class="eq-band-type">
                <select class="eq-type-select" data-id="${band.id}">
                    <option value="peaking" ${band.type === 'peaking' ? 'selected' : ''}>Peak</option>
                    <option value="lowshelf" ${band.type === 'lowshelf' ? 'selected' : ''}>Low Shelf</option>
                    <option value="highshelf" ${band.type === 'highshelf' ? 'selected' : ''}>High Shelf</option>
                    <option value="lowpass" ${band.type === 'lowpass' ? 'selected' : ''}>Low Pass</option>
                    <option value="highpass" ${band.type === 'highpass' ? 'selected' : ''}>High Pass</option>
                    <option value="notch" ${band.type === 'notch' ? 'selected' : ''}>Notch</option>
                    <option value="allpass" ${band.type === 'allpass' ? 'selected' : ''}>All Pass</option>
                </select>
            </div>
            <div class="eq-param-control">
                <div class="eq-param-info">
                    <span class="eq-param-label">Freq</span>
                    <span class="eq-param-val">${Math.round(band.frequency)} Hz</span>
                </div>
                <input type="range" class="eq-param-slider eq-freq-slider" min="0" max="1" step="0.0001" value="${Math.log10(band.frequency / 20) / Math.log10(20000 / 20)}" data-id="${band.id}">
            </div>
            <div class="eq-param-control">
                <div class="eq-param-info">
                    <span class="eq-param-label">Q (Width)</span>
                    <span class="eq-param-val">${parseFloat(band.Q).toFixed(1)}</span>
                </div>
                <input type="range" class="eq-param-slider eq-q-slider" min="0.1" max="10.0" step="0.1" value="${band.Q}" data-id="${band.id}">
            </div>
            <div class="eq-param-control">
                <div class="eq-param-info">
                    <span class="eq-param-label">Gain</span>
                    <span class="eq-param-val">${isGainless ? 'N/A' : (band.gain > 0 ? '+' : '') + parseFloat(band.gain).toFixed(1) + ' dB'}</span>
                </div>
                <input type="range" class="eq-param-slider eq-gain-slider" min="-12.0" max="12.0" step="0.1" value="${band.gain}" ${isGainless ? 'disabled' : ''} data-id="${band.id}">
            </div>
            <div class="eq-bypass-switch">
                <label class="eq-switch-label">
                    <input type="checkbox" class="eq-active-checkbox" ${band.active ? 'checked' : ''} data-id="${band.id}">
                    <span class="eq-slider-toggle"></span>
                </label>
            </div>
            <div class="eq-band-actions">
                <button class="eq-delete-btn" data-id="${band.id}" ${eqBandsData.length <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        container.appendChild(row);
    });
    
    try {
        bindEQBandListeners();
    } catch (e) {
        console.error("Error in bindEQBandListeners:", e);
    }
}

function bindEQBandListeners() {
    document.querySelectorAll('.eq-type-select').forEach(select => {
        select.onchange = (e) => {
            const id = parseInt(e.target.dataset.id);
            const band = eqBandsData.find(b => b.id === id);
            if (band) {
                band.type = e.target.value;
                if (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass') {
                    band.gain = 0;
                }
                saveEQState();
                try { rebuildAudioChain(); } catch (err) {}
                try { renderEQBands(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
                
                document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            }
        };
    });
    
    document.querySelectorAll('.eq-freq-slider').forEach(slider => {
        slider.oninput = (e) => {
            const id = parseInt(e.target.dataset.id);
            const band = eqBandsData.find(b => b.id === id);
            if (band) {
                const val = parseFloat(e.target.value);
                band.frequency = 20 * Math.pow(1000, val);
                
                const valText = slider.previousElementSibling ? slider.previousElementSibling.querySelector('.eq-param-val') : null;
                if (valText) valText.textContent = `${Math.round(band.frequency)} Hz`;
                
                try { updateAudioParameters(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
            }
        };
        slider.onchange = () => {
            saveEQState();
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
        };
    });
    
    document.querySelectorAll('.eq-q-slider').forEach(slider => {
        slider.oninput = (e) => {
            const id = parseInt(e.target.dataset.id);
            const band = eqBandsData.find(b => b.id === id);
            if (band) {
                band.Q = parseFloat(e.target.value);
                
                const valText = slider.previousElementSibling ? slider.previousElementSibling.querySelector('.eq-param-val') : null;
                if (valText) valText.textContent = parseFloat(band.Q).toFixed(1);
                
                try { updateAudioParameters(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
            }
        };
        slider.onchange = () => {
            saveEQState();
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
        };
    });
    
    document.querySelectorAll('.eq-gain-slider').forEach(slider => {
        slider.oninput = (e) => {
            const id = parseInt(e.target.dataset.id);
            const band = eqBandsData.find(b => b.id === id);
            if (band) {
                band.gain = parseFloat(e.target.value);
                
                const valText = slider.previousElementSibling ? slider.previousElementSibling.querySelector('.eq-param-val') : null;
                if (valText) valText.textContent = `${band.gain > 0 ? '+' : ''}${parseFloat(band.gain).toFixed(1)} dB`;
                
                try { updateAudioParameters(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
            }
        };
        slider.onchange = () => {
            saveEQState();
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
        };
    });
    
    document.querySelectorAll('.eq-active-checkbox').forEach(checkbox => {
        checkbox.onchange = (e) => {
            const id = parseInt(e.target.dataset.id);
            const band = eqBandsData.find(b => b.id === id);
            if (band) {
                band.active = e.target.checked;
                
                const row = e.target.closest('.eq-band-row');
                if (row) {
                    if (band.active) {
                        row.classList.remove('bypassed');
                    } else {
                        row.classList.add('bypassed');
                    }
                }
                
                saveEQState();
                try { rebuildAudioChain(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
                
                document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            }
        };
    });
    
    document.querySelectorAll('.eq-delete-btn').forEach(btn => {
        btn.onclick = () => {
            const id = parseInt(btn.dataset.id);
            if (eqBandsData.length <= 1) return;
            
            const index = eqBandsData.findIndex(b => b.id === id);
            if (index !== -1) {
                eqBandsData.splice(index, 1);
                saveEQState();
                try { rebuildAudioChain(); } catch (err) {}
                try { renderEQBands(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
                
                document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            }
        };
    });
    
    // Bind Add Band and Reset actions
    const addBtn = document.getElementById('eq-add-band-btn');
    if (addBtn) {
        addBtn.onclick = () => {
            if (eqBandsData.length >= 10) return;
            
            // Calculate a safe non-NaN newId
            let maxId = 0;
            eqBandsData.forEach(b => {
                if (b && typeof b.id === 'number' && !isNaN(b.id)) {
                    if (b.id > maxId) maxId = b.id;
                }
            });
            const newId = maxId + 1;
            
            // Place new band at 1kHz peaking
            eqBandsData.push({
                id: newId,
                type: 'peaking',
                frequency: 1000,
                Q: 1.0,
                gain: 0,
                active: true
            });
            
            saveEQState();
            try { rebuildAudioChain(); } catch (err) {}
            try { renderEQBands(); } catch (err) {}
            try { drawEqGraph(); } catch (err) {}
            
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
        };
    }
    
    const resetBtn = document.getElementById('eq-reset-btn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            eqBandsData.forEach(band => {
                if (band) {
                    band.gain = 0;
                    band.type = 'peaking';
                    band.active = true;
                }
            });
            
            saveEQState();
            try { rebuildAudioChain(); } catch (err) {}
            try { renderEQBands(); } catch (err) {}
            try { drawEqGraph(); } catch (err) {}
            
            document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            const flatPreset = document.querySelector('[data-preset="flat"]');
            if (flatPreset) flatPreset.classList.add('active');
        };
    }
}

function applyEQPreset(preset) {
    let presetBands = [];
    
    if (preset === 'flat') {
        const freqs = [60, 230, 910, 4000, 14000];
        presetBands = freqs.map((f, idx) => ({
            id: idx + 1,
            type: 'peaking',
            frequency: f,
            Q: 1.0,
            gain: 0,
            active: true
        }));
    } else if (preset === 'bass-boost') {
        presetBands = [
            { id: 1, type: 'lowshelf', frequency: 60, Q: 0.7, gain: 8.0, active: true },
            { id: 2, type: 'peaking', frequency: 250, Q: 1.0, gain: 3.0, active: true },
            { id: 3, type: 'peaking', frequency: 1000, Q: 1.0, gain: 0.0, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: -1.5, active: true },
            { id: 5, type: 'highshelf', frequency: 12000, Q: 0.7, gain: -3.0, active: true }
        ];
    } else if (preset === 'treble-boost') {
        presetBands = [
            { id: 1, type: 'lowshelf', frequency: 80, Q: 0.7, gain: -3.0, active: true },
            { id: 2, type: 'peaking', frequency: 250, Q: 1.0, gain: -1.5, active: true },
            { id: 3, type: 'peaking', frequency: 1000, Q: 1.0, gain: 1.0, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: 4.0, active: true },
            { id: 5, type: 'highshelf', frequency: 12000, Q: 0.7, gain: 8.0, active: true }
        ];
    } else if (preset === 'vocal-boost') {
        presetBands = [
            { id: 1, type: 'highpass', frequency: 100, Q: 0.7, gain: 0.0, active: true },
            { id: 2, type: 'peaking', frequency: 230, Q: 1.0, gain: -2.0, active: true },
            { id: 3, type: 'peaking', frequency: 1000, Q: 0.8, gain: 3.5, active: true },
            { id: 4, type: 'peaking', frequency: 3500, Q: 1.2, gain: 5.0, active: true },
            { id: 5, type: 'highshelf', frequency: 12000, Q: 0.7, gain: 2.0, active: true }
        ];
    } else if (preset === 'electronic') {
        presetBands = [
            { id: 1, type: 'lowshelf', frequency: 50, Q: 0.7, gain: 6.5, active: true },
            { id: 2, type: 'peaking', frequency: 250, Q: 1.0, gain: 2.5, active: true },
            { id: 3, type: 'peaking', frequency: 910, Q: 1.0, gain: -1.5, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: 2.0, active: true },
            { id: 5, type: 'highshelf', frequency: 12000, Q: 0.7, gain: 5.0, active: true }
        ];
    } else if (preset === 'rock') {
        presetBands = [
            { id: 1, type: 'peaking', frequency: 60, Q: 1.0, gain: 5.0, active: true },
            { id: 2, type: 'peaking', frequency: 230, Q: 1.0, gain: 2.0, active: true },
            { id: 3, type: 'peaking', frequency: 910, Q: 1.0, gain: -2.0, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: 1.5, active: true },
            { id: 5, type: 'peaking', frequency: 14000, Q: 1.0, gain: 3.5, active: true }
        ];
    } else if (preset === 'pop') {
        presetBands = [
            { id: 1, type: 'lowshelf', frequency: 60, Q: 0.7, gain: 4.0, active: true },
            { id: 2, type: 'peaking', frequency: 230, Q: 1.0, gain: 1.5, active: true },
            { id: 3, type: 'peaking', frequency: 910, Q: 1.0, gain: -1.0, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: 2.0, active: true },
            { id: 5, type: 'highshelf', frequency: 14000, Q: 0.7, gain: 3.5, active: true }
        ];
    } else if (preset === 'acoustic') {
        presetBands = [
            { id: 1, type: 'lowshelf', frequency: 60, Q: 0.7, gain: 1.5, active: true },
            { id: 2, type: 'peaking', frequency: 230, Q: 1.0, gain: 2.0, active: true },
            { id: 3, type: 'peaking', frequency: 910, Q: 0.9, gain: 1.0, active: true },
            { id: 4, type: 'peaking', frequency: 4000, Q: 1.0, gain: 2.5, active: true },
            { id: 5, type: 'highshelf', frequency: 12000, Q: 0.7, gain: 3.0, active: true }
        ];
    }
    
    if (presetBands.length > 0) {
        eqBandsData = presetBands;
        saveEQState();
        try { rebuildAudioChain(); } catch (err) {}
        try { renderEQBands(); } catch (err) {}
        try { drawEqGraph(); } catch (err) {}
    }
}

function drawEqGraph() {
    const canvas = document.getElementById('eq-graph-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    try {
        const rect = canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        
        ctx.clearRect(0, 0, w, h);
        
        // Draw Grid Lines (dB scale)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        const dbs = [12, 6, 0, -6, -12];
        dbs.forEach(db => {
            const y = gainToY(db, h);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '500 10px Outfit, Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${db > 0 ? '+' : ''}${db}dB`, 12, y - 4);
        });
        
        // Draw Grid Lines (Frequency scale)
        const freqsList = [
            { f: 20, label: '20Hz' },
            { f: 50, label: '' },
            { f: 100, label: '100Hz' },
            { f: 200, label: '' },
            { f: 500, label: '' },
            { f: 1000, label: '1kHz' },
            { f: 2000, label: '' },
            { f: 5000, label: '' },
            { f: 10000, label: '10kHz' },
            { f: 20000, label: '20kHz' }
        ];
        
        freqsList.forEach(item => {
            const x = freqToX(item.f, w);
            ctx.strokeStyle = item.label ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h - 20);
            ctx.stroke();
            
            if (item.label) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.font = '500 9px Outfit, Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(item.label, x, h - 6);
            }
        });
        
        // Generate combined frequency response curve
        const points = 240;
        const fMin = 20;
        const fMax = 20000;
        const sampleFreqs = new Float32Array(points);
        for (let i = 0; i < points; i++) {
            sampleFreqs[i] = fMin * Math.pow(fMax / fMin, i / (points - 1));
        }
        
        const totalMag = new Float32Array(points).fill(1.0);
        const magResponse = new Float32Array(points);
        const phaseResponse = new Float32Array(points);
        
        if (audioCtx && eqFilters.length > 0) {
            eqFilters.forEach((filter, idx) => {
                const band = eqBandsData[idx];
                if (filter && band && band.active) {
                    try {
                        // Ensure values are exact for graph drawing
                        filter.type = band.type;
                        filter.frequency.value = band.frequency;
                        filter.Q.value = band.Q;
                        filter.gain.value = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass') ? 0 : band.gain;
                        
                        filter.getFrequencyResponse(sampleFreqs, magResponse, phaseResponse);
                        for (let i = 0; i < points; i++) {
                            totalMag[i] *= magResponse[i];
                        }
                    } catch (e) {
                        console.warn("Error drawing specific band magnitude response:", e);
                    }
                }
            });
        }
        
        // Draw curve
        const accentColor = state.settings.accentColor || '#ec5464';
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = accentColor;
        ctx.beginPath();
        
        for (let i = 0; i < points; i++) {
            const x = freqToX(sampleFreqs[i], w);
            const mag = totalMag[i];
            const db = 20 * Math.log10(mag || 0.0001);
            const clamped = Math.max(-15, Math.min(15, db));
            const y = gainToY(clamped, h);
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Gradient underneath curve
        ctx.shadowBlur = 0;
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(${hexToRgb(accentColor)}, 0.15)`);
        grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, `rgba(${hexToRgb(accentColor)}, 0.15)`);
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.8;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        
        // Helper function to extract RGB from hex color for the gradient opacity
        function hexToRgb(hex) {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '236, 84, 100';
        }
        
        // Draw draggable interactive band nodes
        const colors = [
            '#ff5e7e', '#ff9f43', '#f1c40f', '#2ecc71', '#1abc9c',
            '#3498db', '#9b59b6', '#fd79a8', '#00cec9', '#6c5ce7'
        ];
        
        eqBandsData.forEach((band, idx) => {
            if (!band) return;
            const bandColor = colors[idx % colors.length];
            const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
            const cx = freqToX(band.frequency, w);
            const cy = gainToY(isGainless ? 0 : band.gain, h);
            
            const isDragged = (activeDragBandId === band.id);
            const isHovered = (hoveredBandId === band.id);
            
            ctx.shadowBlur = (isDragged || isHovered) ? 14 : 6;
            ctx.shadowColor = bandColor;
            ctx.fillStyle = bandColor;
            ctx.beginPath();
            ctx.arc(cx, cy, (isDragged || isHovered) ? 10 : 7.5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Draw border
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw band index text inside node
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px Outfit, Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(idx + 1, cx, cy + 0.5);
        });
    } catch (e) {
        console.error("Error drawing EQ graph:", e);
    }
}

function initCanvasDragging() {
    const canvas = document.getElementById('eq-graph-canvas');
    if (!canvas) return;
    
    canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const w = rect.width;
        const h = rect.height;
        
        let clickedBand = null;
        let minDist = Infinity;
        
        eqBandsData.forEach((band) => {
            if (!band) return;
            const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
            const cx = freqToX(band.frequency, w);
            const cy = gainToY(isGainless ? 0 : band.gain, h);
            
            const dist = Math.hypot(mouseX - cx, mouseY - cy);
            if (dist < 18 && dist < minDist) {
                minDist = dist;
                clickedBand = band;
            }
        });
        
        if (clickedBand) {
            activeDragBandId = clickedBand.id;
            canvas.style.cursor = 'grabbing';
            try { drawEqGraph(); } catch (err) {}
        }
    };
    
    canvas.onmousemove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const w = rect.width;
        const h = rect.height;
        
        if (activeDragBandId !== null) {
            const band = eqBandsData.find(b => b.id === activeDragBandId);
            if (band) {
                band.frequency = xToFreq(mouseX, w);
                
                const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
                if (!isGainless) {
                    band.gain = yToGain(mouseY, h);
                }
                
                try { updateAudioParameters(); } catch (err) {}
                try { drawEqGraph(); } catch (err) {}
                try { updateBandSlidersUI(band); } catch (err) {}
                
                document.querySelectorAll('.btn-eq-preset').forEach(b => b.classList.remove('active'));
            }
        } else {
            let foundHover = null;
            let minDist = Infinity;
            
            eqBandsData.forEach((band) => {
                if (!band) return;
                const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
                const cx = freqToX(band.frequency, w);
                const cy = gainToY(isGainless ? 0 : band.gain, h);
                
                const dist = Math.hypot(mouseX - cx, mouseY - cy);
                if (dist < 18 && dist < minDist) {
                    minDist = dist;
                    foundHover = band.id;
                }
            });
            
            if (foundHover !== hoveredBandId) {
                hoveredBandId = foundHover;
                canvas.style.cursor = hoveredBandId !== null ? 'pointer' : 'crosshair';
                try { drawEqGraph(); } catch (err) {}
            }
        }
    };
    
    const handleMouseUp = () => {
        if (activeDragBandId !== null) {
            saveEQState();
            activeDragBandId = null;
            canvas.style.cursor = hoveredBandId !== null ? 'pointer' : 'crosshair';
            try { drawEqGraph(); } catch (err) {}
        }
    };
    
    canvas.onmouseup = handleMouseUp;
    canvas.onmouseleave = handleMouseUp;
}

function updateBandSlidersUI(band) {
    if (!band) return;
    const row = document.querySelector(`.eq-band-row[data-id="${band.id}"]`);
    if (!row) return;
    
    try {
        const freqSlider = row.querySelector('.eq-freq-slider');
        if (freqSlider) {
            freqSlider.value = Math.log10(band.frequency / 20) / Math.log10(20000 / 20);
            const freqValSpan = freqSlider.previousElementSibling ? freqSlider.previousElementSibling.querySelector('.eq-param-val') : null;
            if (freqValSpan) freqValSpan.textContent = `${Math.round(band.frequency)} Hz`;
        }
        
        const isGainless = (band.type === 'lowpass' || band.type === 'highpass' || band.type === 'notch' || band.type === 'allpass');
        const gainSlider = row.querySelector('.eq-gain-slider');
        if (gainSlider) {
            gainSlider.value = band.gain;
            const gainValSpan = gainSlider.previousElementSibling ? gainSlider.previousElementSibling.querySelector('.eq-param-val') : null;
            if (gainValSpan) {
                gainValSpan.textContent = isGainless ? 'N/A' : `${band.gain > 0 ? '+' : ''}${parseFloat(band.gain).toFixed(1)} dB`;
            }
        }
    } catch (e) {
        console.warn("Error updating band sliders UI dynamically:", e);
    }
}

// -------------------------------------------------------------
// Real-time Audio Visualizer Drawing Functions
// -------------------------------------------------------------
function initVisualizerCanvases() {
    const circCanvas = document.getElementById('fs-circular-visualizer');
    const barsCanvas = document.getElementById('fs-bars-visualizer');
    const rsBarsCanvas = document.getElementById('rs-bars-visualizer');
    
    if (circCanvas) {
        circCanvas.width = 400;
        circCanvas.height = 400;
    }
    
    if (barsCanvas) {
        const resizeBars = () => {
            const rect = barsCanvas.getBoundingClientRect();
            barsCanvas.width = rect.width;
            barsCanvas.height = rect.height;
        };
        resizeBars();
        window.removeEventListener('resize', resizeBars);
        window.addEventListener('resize', resizeBars);
    }

    if (rsBarsCanvas) {
        const resizeRsBars = () => {
            const rect = rsBarsCanvas.getBoundingClientRect();
            rsBarsCanvas.width = rect.width;
            rsBarsCanvas.height = rect.height;
        };
        resizeRsBars();
        window.removeEventListener('resize', resizeRsBars);
        window.addEventListener('resize', resizeRsBars);
    }
}

let visualizerAnimationId = null;

function startVisualizerAnimation() {
    if (visualizerAnimationId) return;
    
    const circCanvas = document.getElementById('fs-circular-visualizer');
    const barsCanvas = document.getElementById('fs-bars-visualizer');
    const rsBarsCanvas = document.getElementById('rs-bars-visualizer');
    if (!circCanvas && !barsCanvas && !rsBarsCanvas) return;
    
    const circCtx = circCanvas ? circCanvas.getContext('2d') : null;
    const barsCtx = barsCanvas ? barsCanvas.getContext('2d') : null;
    const rsBarsCtx = rsBarsCanvas ? rsBarsCanvas.getContext('2d') : null;
    
    const animate = () => {
        // Stop animation if player is closed or paused
        if (!state.isPlaying) {
            stopVisualizerAnimation();
            document.documentElement.style.setProperty('--bass-intensity', '0');
            // Clear canvases
            if (circCanvas && circCtx) circCtx.clearRect(0, 0, circCanvas.width, circCanvas.height);
            if (barsCanvas && barsCtx) barsCtx.clearRect(0, 0, barsCanvas.width, barsCanvas.height);
            if (rsBarsCanvas && rsBarsCtx) rsBarsCtx.clearRect(0, 0, rsBarsCanvas.width, rsBarsCanvas.height);
            return;
        }
        
        try {
            let dataArray = null;
            if (visualizerAnalyser) {
                const bufferLength = visualizerAnalyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                visualizerAnalyser.getByteFrequencyData(dataArray);
                
                // Bass intensity calculation (first 8 bins)
                let bassSum = 0;
                const bassCount = Math.min(8, bufferLength);
                for (let i = 0; i < bassCount; i++) {
                    bassSum += dataArray[i];
                }
                const bassIntensity = Math.min(1.0, (bassSum / bassCount) / 230); // scale up slightly so it is punchy
                document.documentElement.style.setProperty('--bass-intensity', bassIntensity.toFixed(3));
            } else {
                // Simulated fallback if audio analyzer isn't active yet
                document.documentElement.style.setProperty('--bass-intensity', (0.1 + Math.sin(Date.now() / 150) * 0.1).toFixed(3));
            }
            
            const fsPlayer = document.getElementById('fullscreen-player');
            const isFsVisible = fsPlayer && fsPlayer.style.display !== 'none';
            
            // 1. Draw Circular Visualizer
            if (isFsVisible && circCanvas && circCtx && circCanvas.width > 0) {
                drawCircularVisualizer(circCanvas, circCtx, dataArray);
            }
            
            // 2. Draw Linear Bars Visualizer
            if (isFsVisible && barsCanvas && barsCtx) {
                const rect = barsCanvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (barsCanvas.width !== rect.width || barsCanvas.height !== rect.height) {
                        barsCanvas.width = rect.width;
                        barsCanvas.height = rect.height;
                    }
                    drawLinearVisualizer(barsCanvas, barsCtx, dataArray);
                }
            }
     
            // 3. Draw Right Sidebar Visualizer
            if (rsBarsCanvas && rsBarsCtx) {
                const rect = rsBarsCanvas.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (rsBarsCanvas.width !== rect.width || rsBarsCanvas.height !== rect.height) {
                        rsBarsCanvas.width = rect.width;
                        rsBarsCanvas.height = rect.height;
                    }
                    drawLinearVisualizer(rsBarsCanvas, rsBarsCtx, dataArray);
                }
            }
        } catch (err) {
            console.error("Error drawing visualizer frame:", err);
        }
        
        visualizerAnimationId = requestAnimationFrame(animate);
    };
    
    visualizerAnimationId = requestAnimationFrame(animate);
}

function stopVisualizerAnimation() {
    if (visualizerAnimationId) {
        cancelAnimationFrame(visualizerAnimationId);
        visualizerAnimationId = null;
    }
}

function drawCircularVisualizer(canvas, ctx, dataArray) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const centerX = w / 2;
    const centerY = h / 2;
    const innerRadius = 162; // fits around the 320px disc (radius 160px)
    const maxBarLength = 32;
    
    const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '156, 39, 176';
    
    // We want 80 bars in the circle
    const numBars = 80;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    
    for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2;
        
        // Map frequency data to bar height
        let rawVal = 0;
        if (dataArray) {
            const dataIdx = Math.floor((i % (numBars / 2)) / (numBars / 2) * (dataArray.length * 0.6));
            rawVal = dataArray[dataIdx];
        } else {
            // Fallback simulation waves
            rawVal = 30 + Math.sin(i * 0.5 + Date.now() / 120) * 20 + Math.cos(i * 0.1 - Date.now() / 200) * 10;
        }
        
        const fraction = rawVal / 255;
        const barHeight = Math.max(2, fraction * maxBarLength);
        
        const xStart = Math.cos(angle) * innerRadius;
        const yStart = Math.sin(angle) * innerRadius;
        const xEnd = Math.cos(angle) * (innerRadius + barHeight);
        const yEnd = Math.sin(angle) * (innerRadius + barHeight);
        
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${accentRgb}, ${0.3 + fraction * 0.7})`;
        ctx.lineWidth = Math.max(1.5, 3.5 - (barHeight * 0.05));
        ctx.lineCap = 'round';
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
    }
    
    ctx.restore();
}

function drawLinearVisualizer(canvas, ctx, dataArray) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    const numBars = 32;
    const barWidth = Math.max(1, Math.floor(w / numBars) - 4);
    const maxBarHeight = Math.max(1, h - 4);
    
    const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '156, 39, 176';
    
    // Draw bars
    for (let i = 0; i < numBars; i++) {
        let rawVal = 0;
        if (dataArray) {
            // Map index to a logarithmic distribution
            const dataIdx = Math.floor(Math.pow(i / numBars, 1.5) * (dataArray.length * 0.7));
            rawVal = dataArray[dataIdx];
        } else {
            // Fallback simulation
            rawVal = 20 + Math.sin(i * 0.4 + Date.now() / 180) * 15 + Math.cos(i * 0.2 - Date.now() / 100) * 8;
        }
        
        const fraction = rawVal / 255;
        const barHeight = Math.max(3, fraction * maxBarHeight);
        const x = i * (barWidth + 4);
        const y = h - barHeight;
        
        // Rounded bar rectangle
        ctx.beginPath();
        const grad = ctx.createLinearGradient(x, y, x, h);
        grad.addColorStop(0, `rgba(${accentRgb}, 1.0)`);
        grad.addColorStop(0.6, `rgba(${accentRgb}, 0.5)`);
        grad.addColorStop(1, `rgba(${accentRgb}, 0.15)`);
        
        ctx.fillStyle = grad;
        
        // Draw rounded top rect
        const radius = Math.max(0, Math.min(barWidth / 2, 3));
        if (barWidth > 0 && barHeight > 0) {
            ctx.roundRect ? ctx.roundRect(x, y, barWidth, barHeight, radius) : ctx.rect(x, y, barWidth, barHeight);
            ctx.fill();
        }
    }
}

// Resumes AudioContext on initial page interactions
dom.audio.addEventListener('play', () => {
    initEqualizerEngine();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});


/* =============================================================
   2. MUSIC LISTENING STATS LOGGING & INTERACTIVE DASHBOARD
   ============================================================= */
let statsCurrentTrackId = null;
let statsPlayStartTimestamp = null;
let statsLoggedThisTrack = false;

function trackStatsOnPlay(track) {
    if (!track) return;
    if (statsCurrentTrackId === track.id) return;
    
    statsCurrentTrackId = track.id;
    statsPlayStartTimestamp = Date.now();
    statsLoggedThisTrack = false;
}

function handleTimeUpdateStats() {
    if (!state.currentTrack || statsLoggedThisTrack) return;
    if (statsPlayStartTimestamp && (Date.now() - statsPlayStartTimestamp > 15000)) {
        logTrackPlay(state.currentTrack);
        statsLoggedThisTrack = true;
    }
}

function logTrackPlay(track) {
    const plays = JSON.parse(localStorage.getItem('zynic_play_history')) || [];
    
    // Guess a genre based on metadata/title or map Pop/Indie dynamically
    const genresPool = ["Pop", "Indie", "R&B", "Hip-Hop", "Dance", "Acoustic", "Jazz"];
    const guessedGenre = track.genre || genresPool[Math.abs(track.title.charCodeAt(0) || 0) % genresPool.length];
    
    const entry = {
        id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail || track.art || getTrackThumbnail(track, 120),
        genre: guessedGenre,
        timestamp: Date.now(),
        duration: 210 // 3.5 min standard
    };
    
    plays.unshift(entry);
    if (plays.length > 200) plays.pop(); // keep log size bounded
    
    localStorage.setItem('zynic_play_history', JSON.stringify(plays));
    console.log(`Log Play successful: ${track.title} by ${track.artist}`);
    
    // Mutate Digital Pet stats to react to listening groove!
    if (typeof mutatePetStats === 'function') {
        mutatePetStats({ groove: 2.0, bond: 0.5 });
    }
}

function generateMockHistory() {
    const mockTracks = [
        { id: "4NRXx3a8UtQ", title: "Blinding Lights", artist: "The Weeknd", thumbnail: "https://i.ytimg.com/vi/4NRXx3a8UtQ/mqdefault.jpg", genre: "Pop" },
        { id: "fHI8X4OXluQ", title: "Starboy", artist: "The Weeknd", thumbnail: "https://i.ytimg.com/vi/fHI8X4OXluQ/mqdefault.jpg", genre: "Pop" },
        { id: "u18K7H1_tJ0", title: "Save Your Tears", artist: "The Weeknd", thumbnail: "https://i.ytimg.com/vi/u18K7H1_tJ0/mqdefault.jpg", genre: "Pop" },
        { id: "J_QGZspO4gg", title: "As It Was", artist: "Harry Styles", thumbnail: "https://i.ytimg.com/vi/J_QGZspO4gg/mqdefault.jpg", genre: "Indie" },
        { id: "h5oHXIipkwM", title: "Perfect", artist: "Ed Sheeran", thumbnail: "https://i.ytimg.com/vi/h5oHXIipkwM/mqdefault.jpg", genre: "Acoustic" },
        { id: "0V3uY8UdA40", title: "Shape of You", artist: "Ed Sheeran", thumbnail: "https://i.ytimg.com/vi/0V3uY8UdA40/mqdefault.jpg", genre: "Pop" },
        { id: "oygrmJFKYZY", title: "Sweater Weather", artist: "The Neighbourhood", thumbnail: "https://i.ytimg.com/vi/oygrmJFKYZY/mqdefault.jpg", genre: "Indie" },
        { id: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi", thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/mqdefault.jpg", genre: "Latin" }
    ];
    
    const plays = [];
    const now = Date.now();
    for (let i = 0; i < 75; i++) {
        const track = mockTracks[Math.floor(Math.random() * mockTracks.length)];
        const hourOffset = Math.floor(Math.random() * 24);
        const dayOffset = Math.floor(Math.random() * 30);
        const playTime = now - (dayOffset * 24 * 60 * 60 * 1000) - (hourOffset * 60 * 60 * 1000);
        
        plays.push({
            id: track.id,
            title: track.title,
            artist: track.artist,
            thumbnail: track.thumbnail,
            genre: track.genre,
            timestamp: playTime,
            duration: 210
        });
    }
    return plays.sort((a, b) => b.timestamp - a.timestamp);
}

function renderStatsDashboard() {
    let plays = JSON.parse(localStorage.getItem('zynic_play_history')) || [];
    if (plays.length === 0) {
        plays = generateMockHistory();
        localStorage.setItem('zynic_play_history', JSON.stringify(plays));
    }
    
    // Aggregates
    const totalMinutes = Math.round((plays.length * 3.5));
    
    const uniqueSongs = new Set();
    const uniqueArtists = new Set();
    const songsFreq = {};
    const artistsFreq = {};
    const genresFreq = {};
    const hoursFreq = Array(24).fill(0);
    
    plays.forEach(play => {
        uniqueSongs.add(play.id);
        uniqueArtists.add(play.artist);
        
        songsFreq[play.id] = (songsFreq[play.id] || 0) + 1;
        artistsFreq[play.artist] = (artistsFreq[play.artist] || 0) + 1;
        genresFreq[play.genre] = (genresFreq[play.genre] || 0) + 1;
        
        const date = new Date(play.timestamp);
        hoursFreq[date.getHours()]++;
    });
    
    // Update labels
    document.getElementById('stats-total-minutes').textContent = totalMinutes.toLocaleString();
    document.getElementById('stats-unique-songs').textContent = uniqueSongs.size;
    document.getElementById('stats-unique-artists').textContent = uniqueArtists.size;
    
    // Stagger render Top Tracks
    const topSongsSorted = Object.keys(songsFreq)
        .map(id => {
            const playObj = plays.find(p => p.id === id);
            return {
                id,
                title: playObj.title,
                artist: playObj.artist,
                thumbnail: playObj.thumbnail,
                count: songsFreq[id]
            };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
        
    const tracksContainer = document.getElementById('stats-top-tracks-list');
    tracksContainer.innerHTML = '';
    const maxTrackCount = topSongsSorted[0]?.count || 1;
    
    topSongsSorted.forEach(track => {
        const pct = (track.count / maxTrackCount) * 100;
        const row = document.createElement('div');
        row.className = 'stats-bar-row';
        row.innerHTML = `
            <img src="${track.thumbnail}" alt="Art" onerror="handleImageError(this, '${track.id}', 120)">
            <div class="stats-bar-details">
                <div class="stats-bar-title">${track.title}</div>
                <div class="stats-bar-subtitle">${track.artist}</div>
            </div>
            <div class="stats-bar-visual">
                <div class="stats-bar-track">
                    <div class="stats-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="stats-bar-count">${track.count} plays</div>
            </div>
        `;
        tracksContainer.appendChild(row);
    });
    
    // Stagger render Top Artists
    const topArtistsSorted = Object.keys(artistsFreq)
        .map(name => ({ name, count: artistsFreq[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
        
    const artistsContainer = document.getElementById('stats-top-artists-list');
    artistsContainer.innerHTML = '';
    const maxArtistCount = topArtistsSorted[0]?.count || 1;
    
    topArtistsSorted.forEach(art => {
        const pct = (art.count / maxArtistCount) * 100;
        const row = document.createElement('div');
        row.className = 'stats-bar-row';
        
        // Circular profile visual mock for artists
        row.innerHTML = `
            <div class="wrapped-item-avatar" style="width:36px; height:36px; border-radius:50%; flex-shrink:0;">
                <i class="fa-solid fa-microphone-lines"></i>
            </div>
            <div class="stats-bar-details">
                <div class="stats-bar-title">${art.name}</div>
                <div class="stats-bar-subtitle">Zynic Top Listener</div>
            </div>
            <div class="stats-bar-visual">
                <div class="stats-bar-track">
                    <div class="stats-bar-fill" style="width: ${pct}%"></div>
                </div>
                <div class="stats-bar-count">${art.count} plays</div>
            </div>
        `;
        artistsContainer.appendChild(row);
    });
    
    // Render Genre breakdown
    const genreSorted = Object.keys(genresFreq)
        .map(g => ({ genre: g, count: genresFreq[g] }))
        .sort((a, b) => b.count - a.count);
        
    const genresContainer = document.getElementById('stats-genres-list');
    genresContainer.innerHTML = '';
    const maxGenreCount = plays.length || 1;
    
    genreSorted.forEach(g => {
        const pct = Math.round((g.count / maxGenreCount) * 100);
        const row = document.createElement('div');
        row.className = 'genre-progress-row';
        row.innerHTML = `
            <div class="genre-progress-meta">
                <span class="genre-progress-label">${g.genre}</span>
                <span class="genre-progress-percent">${pct}%</span>
            </div>
            <div class="genre-progress-track">
                <div class="genre-progress-bar" style="width: ${pct}%"></div>
            </div>
        `;
        genresContainer.appendChild(row);
    });
    
    // Render Hourly Heatmap grid (24 intervals)
    const heatmapContainer = document.getElementById('stats-heatmap-grid');
    heatmapContainer.innerHTML = '';
    const maxHourCount = Math.max(...hoursFreq) || 1;
    
    for (let h = 0; h < 24; h++) {
        const count = hoursFreq[h];
        const opacity = maxHourCount > 0 ? (count / maxHourCount) * 0.8 + 0.05 : 0.05;
        
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.innerHTML = `
            <div class="heatmap-cell-time">${h === 0 ? '12am' : h === 12 ? '12pm' : h > 12 ? (h - 12) + 'pm' : h + 'am'}</div>
            <div class="heatmap-cell-bar" style="opacity: ${opacity}"></div>
        `;
        heatmapContainer.appendChild(cell);
    }
}


/* =============================================================
   3. SONG FINDER (AUDIO RECOGNITION) LOGIC
   ============================================================= */
let micStream = null;
let micSourceNode = null;
let micAnalyser = null;
let micAnimationId = null;

function initSongFinderUI() {
    // Reset views
    document.getElementById('rec-state-ready').style.display = 'flex';
    document.getElementById('rec-state-listening').style.display = 'none';
    document.getElementById('rec-state-processing').style.display = 'none';
    document.getElementById('rec-state-success').style.display = 'none';
    document.getElementById('rec-state-error').style.display = 'none';
    
    renderSongFinderHistory();
    
    // Bind buttons
    document.getElementById('rec-btn-start').onclick = startAudioRecognition;
    document.getElementById('rec-btn-cancel').onclick = cancelAudioRecognition;
    document.getElementById('rec-btn-retry').onclick = startAudioRecognition;
    document.getElementById('rec-btn-error-retry').onclick = startAudioRecognition;
    document.getElementById('rec-btn-close').onclick = () => navigateToTab('home');
}

async function startAudioRecognition() {
    document.getElementById('rec-state-ready').style.display = 'none';
    document.getElementById('rec-state-error').style.display = 'none';
    document.getElementById('rec-state-listening').style.display = 'flex';
    
    try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const micContext = new AudioContextClass();
        micSourceNode = micContext.createMediaStreamSource(micStream);
        micAnalyser = micContext.createAnalyser();
        micAnalyser.fftSize = 256;
        micSourceNode.connect(micAnalyser);
        
        drawMicrophoneWaveform(true);
    } catch (e) {
        console.warn("Microphone access blocked. Using premium procedural waveform visualization:", e);
        drawMicrophoneWaveform(false);
    }
    
    // Mock Listening timeout of 4 seconds -> then processing
    setTimeout(() => {
        if (state.currentTab === 'recognition' && document.getElementById('rec-state-listening').style.display === 'flex') {
            stopAudioCapture();
            processAudioSignature();
        }
    }, 4000);
}

function drawMicrophoneWaveform(useRealMic) {
    const canvas = document.getElementById('rec-mic-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    let bufferLength = 128;
    let dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        if (!state.currentTab || state.currentTab !== 'recognition' || document.getElementById('rec-state-listening').style.display !== 'flex') {
            cancelAnimationFrame(micAnimationId);
            return;
        }
        
        micAnimationId = requestAnimationFrame(draw);
        ctx.clearRect(0, 0, w, h);
        
        if (useRealMic && micAnalyser) {
            micAnalyser.getByteTimeDomainData(dataArray);
        } else {
            // Proc animation values
            const time = Date.now() * 0.006;
            for (let i = 0; i < bufferLength; i++) {
                dataArray[i] = 128 + Math.sin(i * 0.12 + time) * 20 * Math.sin(time * 0.35);
            }
        }
        
        ctx.strokeStyle = state.settings.accentColor || '#ec5464';
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 15;
        ctx.shadowColor = state.settings.accentColor || '#ec5464';
        ctx.beginPath();
        
        const cx = w / 2;
        const cy = h / 2;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const angle = (i / bufferLength) * Math.PI * 2;
            const r = 58 + (v - 1.0) * 35;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        
        ctx.shadowBlur = 0; // reset
        
        // Render inner solid accent button
        ctx.fillStyle = state.settings.accentColor || '#ec5464';
        ctx.beginPath();
        ctx.arc(cx, cy, 50, 0, Math.PI * 2);
        ctx.fill();
        
        // Render icon
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 24px "Font Awesome 6 Free"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uf130', cx, cy);
    }
    draw();
}

function stopAudioCapture() {
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
    }
    cancelAnimationFrame(micAnimationId);
}

function cancelAudioRecognition() {
    stopAudioCapture();
    initSongFinderUI();
}

function processAudioSignature() {
    document.getElementById('rec-state-listening').style.display = 'none';
    document.getElementById('rec-state-processing').style.display = 'flex';
    
    // Processing time of 2.5 seconds -> then Success
    setTimeout(() => {
        if (state.currentTab === 'recognition' && document.getElementById('rec-state-processing').style.display === 'flex') {
            displayRecognitionSuccess();
        }
    }, 2500);
}

function displayRecognitionSuccess() {
    document.getElementById('rec-state-processing').style.display = 'none';
    
    // Matcher rules:
    // 1. If song is playing, identify that song
    // 2. Else pick one popular song
    let matchedTrack = null;
    if (state.currentTrack) {
        matchedTrack = { ...state.currentTrack };
    } else {
        matchedTrack = {
            id: "4NRXx3a8UtQ",
            title: "Blinding Lights",
            artist: "The Weeknd",
            thumbnail: "https://i.ytimg.com/vi/4NRXx3a8UtQ/mqdefault.jpg",
            album: "After Hours",
            type: "song"
        };
    }
    
    document.getElementById('rec-result-art').src = matchedTrack.thumbnail || getTrackThumbnail(matchedTrack, 300);
    document.getElementById('rec-result-title').textContent = matchedTrack.title;
    document.getElementById('rec-result-artist').textContent = matchedTrack.artist;
    document.getElementById('rec-result-album').textContent = matchedTrack.album || 'Zynic Single';
    
    // Save to Finder history
    saveRecognitionHistory(matchedTrack);
    renderSongFinderHistory();
    
    // Bind Play Song button
    document.getElementById('rec-btn-play').onclick = () => {
        playTrack(matchedTrack, [matchedTrack]);
        showToast(`Playing Identified Track: ${matchedTrack.title}`);
        navigateToTab('home');
    };
    
    document.getElementById('rec-state-success').style.display = 'flex';
}

function saveRecognitionHistory(track) {
    const history = JSON.parse(localStorage.getItem('zynic_rec_history')) || [];
    // Prevent duplicates
    if (!history.some(item => item.id === track.id)) {
        history.unshift({
            id: track.id,
            title: track.title,
            artist: track.artist,
            thumbnail: track.thumbnail,
            timestamp: Date.now()
        });
        if (history.length > 10) history.pop();
        localStorage.setItem('zynic_rec_history', JSON.stringify(history));
    }
}

function renderSongFinderHistory() {
    const history = JSON.parse(localStorage.getItem('zynic_rec_history')) || [];
    const list = document.getElementById('rec-history-list');
    const emptyState = document.getElementById('rec-history-empty');
    
    list.innerHTML = '';
    
    if (history.length > 0) {
        emptyState.style.display = 'none';
        list.style.display = 'flex';
        
        history.forEach((track, index) => {
            const row = document.createElement('div');
            row.className = 'music-row-item';
            row.style.padding = '10px 16px';
            row.innerHTML = `
                <span class="row-index">${index + 1}</span>
                <img class="row-art" src="${track.thumbnail || getTrackThumbnail(track, 150)}" alt="Art" onerror="handleImageError(this, '${track.id}', 150)">
                <div class="row-details">
                    <div class="row-title">${track.title}</div>
                    <div class="row-subtitle">${track.artist}</div>
                </div>
                <div class="row-actions">
                    <button class="row-btn play-btn" title="Play"><i class="fa-solid fa-play"></i></button>
                </div>
            `;
            
            row.querySelector('.play-btn').onclick = (e) => {
                e.stopPropagation();
                playTrack(track, [track]);
                showToast(`Playing Identified Track: ${track.title}`);
                navigateToTab('home');
            };
            list.appendChild(row);
        });
    } else {
        emptyState.style.display = 'flex';
        list.style.display = 'none';
    }
}


/* =============================================================
   4. IMAPACTFUL WRAPPED 2026 RECAP SLIDESHOW
   ============================================================= */
let wrappedActiveSlide = 0;
let wrappedSlideProgress = 0;
let wrappedSlideTimer = null;
let wrappedBackgroundMusic = null;
let wrappedParticleAnimationId = null;
let wrappedParticles = [];

function initWrappedSlideshow() {
    const overlay = document.getElementById('wrapped-overlay');
    if (!overlay) return;
    
    overlay.style.display = 'flex';
    wrappedActiveSlide = 0;
    
    // Background Music check
    let plays = JSON.parse(localStorage.getItem('zynic_play_history')) || [];
    let topSong = null;
    
    if (plays.length > 0) {
        const freqs = {};
        plays.forEach(p => freqs[p.id] = (freqs[p.id] || 0) + 1);
        const topId = Object.keys(freqs).sort((a,b) => freqs[b] - freqs[a])[0];
        topSong = plays.find(p => p.id === topId);
    }
    
    if (!topSong) {
        topSong = {
            id: "fHI8X4OXluQ",
            title: "Starboy",
            artist: "The Weeknd",
            thumbnail: "https://i.ytimg.com/vi/fHI8X4OXluQ/mqdefault.jpg"
        };
    }
    
    // Stop main audio
    dom.audio.pause();
    state.isPlaying = false;
    dom.miniBtnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    dom.fsBtnPlay.innerHTML = '<i class="fa-solid fa-play"></i>';
    
    // Load ambient backing music dynamically using API stream or Zynic direct link
    if (!wrappedBackgroundMusic) {
        wrappedBackgroundMusic = new Audio();
    }
    
    // Fetch streaming link for top song to serve as soundtrack
    fetch(`/api/stream?id=${topSong.id}`, { headers: getAuthHeaders() })
        .then(res => res.json())
        .then(data => {
            if (overlay.style.display === 'flex') {
                wrappedBackgroundMusic.src = data.url;
                wrappedBackgroundMusic.volume = 0.35;
                wrappedBackgroundMusic.loop = true;
                wrappedBackgroundMusic.play();
            }
        })
        .catch(e => console.warn("Wrapped background stream load blocked:", e));
        
    // Canvas particles setup
    initWrappedParticleCanvas();
    
    // Render progress indicators
    const progressContainer = document.getElementById('wrapped-progress-ticks');
    progressContainer.innerHTML = '';
    const slides = document.querySelectorAll('.wrapped-slide');
    
    slides.forEach((slide, idx) => {
        const tick = document.createElement('div');
        tick.className = `wrapped-tick ${idx === 0 ? 'active' : ''}`;
        tick.innerHTML = '<div class="wrapped-tick-fill"></div>';
        progressContainer.appendChild(tick);
    });
    
    // Bind navigation tap zones
    document.getElementById('wrapped-nav-left').onclick = prevWrappedSlide;
    document.getElementById('wrapped-nav-right').onclick = nextWrappedSlide;
    document.getElementById('wrapped-btn-begin').onclick = nextWrappedSlide;
    document.getElementById('wrapped-close-btn-top').onclick = closeWrappedSlideshow;
    
    document.getElementById('wrapped-btn-save-playlist').onclick = saveWrappedPlaylist;
    document.getElementById('wrapped-btn-replay').onclick = () => {
        wrappedActiveSlide = 0;
        showWrappedSlide(0);
    };
    document.getElementById('wrapped-btn-close-end').onclick = closeWrappedSlideshow;
    
    showWrappedSlide(0);
}

function showWrappedSlide(index) {
    const slides = document.querySelectorAll('.wrapped-slide');
    const ticks = document.querySelectorAll('.wrapped-tick');
    if (index < 0 || index >= slides.length) return;
    
    clearInterval(wrappedSlideTimer);
    
    // Manage slides active statuses
    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === index);
    });
    
    // Manage ticks progress
    ticks.forEach((tick, idx) => {
        tick.classList.toggle('completed', idx < index);
        tick.classList.toggle('active', idx === index);
        const fill = tick.querySelector('.wrapped-tick-fill');
        if (fill) fill.style.width = '0%';
    });
    
    wrappedActiveSlide = index;
    wrappedSlideProgress = 0;
    
    // Dynamic Slide Actions (Count-ups and loads)
    let plays = JSON.parse(localStorage.getItem('zynic_play_history')) || generateMockHistory();
    const totalMinutes = Math.round(plays.length * 3.5);
    
    const songsFreq = {};
    const artistsFreq = {};
    plays.forEach(p => {
        songsFreq[p.id] = (songsFreq[p.id] || 0) + 1;
        artistsFreq[p.artist] = (artistsFreq[p.artist] || 0) + 1;
    });
    
    const topSongId = Object.keys(songsFreq).sort((a,b) => songsFreq[b] - songsFreq[a])[0] || "fHI8X4OXluQ";
    const topSong = plays.find(p => p.id === topSongId) || { title: "Starboy", artist: "The Weeknd", thumbnail: "https://i.ytimg.com/vi/fHI8X4OXluQ/mqdefault.jpg" };
    
    const topArtistName = Object.keys(artistsFreq).sort((a,b) => artistsFreq[b] - artistsFreq[a])[0] || "The Weeknd";
    
    // Slide 2: Minutes Count up
    if (index === 1) {
        const valDisp = document.getElementById('wrapped-minutes-val-display');
        animateCountUp(valDisp, 0, totalMinutes, 2000);
    }
    
    // Slide 3: Top Song details
    if (index === 2) {
        document.getElementById('wrapped-top-song-art').src = topSong.thumbnail || getTrackThumbnail(topSong, 300);
        document.getElementById('wrapped-top-song-title').textContent = topSong.title;
        document.getElementById('wrapped-top-song-artist').textContent = topSong.artist;
        document.getElementById('wrapped-top-song-plays').textContent = songsFreq[topSongId] || 12;
    }
    
    // Slide 4: Top 5 Songs List
    if (index === 3) {
        const songsList = Object.keys(songsFreq)
            .map(id => {
                const p = plays.find(item => item.id === id);
                return { title: p.title, artist: p.artist, thumbnail: p.thumbnail, count: songsFreq[id] };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
            
        const listDiv = document.getElementById('wrapped-top-5-songs-list');
        listDiv.innerHTML = '';
        songsList.forEach((song, i) => {
            const row = document.createElement('div');
            row.className = 'wrapped-list-item';
            row.style.animationDelay = `${i * 150}ms`;
            row.innerHTML = `
                <span class="wrapped-item-rank">#${i + 1}</span>
                <img class="wrapped-item-art" src="${song.thumbnail || getTrackThumbnail(song, 80)}" alt="Art">
                <div class="wrapped-item-details">
                    <div class="wrapped-item-title">${song.title}</div>
                    <div class="wrapped-item-subtitle">${song.artist}</div>
                </div>
                <span class="wrapped-item-value">${song.count} plays</span>
            `;
            listDiv.appendChild(row);
        });
    }
    
    // Slide 5: Top Artist
    if (index === 4) {
        document.getElementById('wrapped-top-artist-name').textContent = topArtistName;
    }
    
    // Slide 6: Top 5 Artists List
    if (index === 5) {
        const artistsList = Object.keys(artistsFreq)
            .map(name => ({ name, count: artistsFreq[name] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
            
        const listDiv = document.getElementById('wrapped-top-5-artists-list');
        listDiv.innerHTML = '';
        artistsList.forEach((art, i) => {
            const row = document.createElement('div');
            row.className = 'wrapped-list-item';
            row.style.animationDelay = `${i * 150}ms`;
            row.innerHTML = `
                <span class="wrapped-item-rank">#${i + 1}</span>
                <div class="wrapped-item-avatar">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="wrapped-item-details">
                    <div class="wrapped-item-title">${art.name}</div>
                    <div class="wrapped-item-subtitle">Zynic Superfan</div>
                </div>
                <span class="wrapped-item-value">${art.count} plays</span>
            `;
            listDiv.appendChild(row);
        });
    }
    
    // Slide 7: Collage Summary
    if (index === 6) {
        document.getElementById('collage-minutes').textContent = totalMinutes.toLocaleString();
        document.getElementById('collage-song-art').src = topSong.thumbnail || getTrackThumbnail(topSong, 300);
        document.getElementById('collage-song-title').textContent = topSong.title;
        document.getElementById('collage-song-artist').textContent = topSong.artist;
        document.getElementById('collage-artist-title').textContent = topArtistName;
        
        // Pick top genre
        const genresFreq = {};
        plays.forEach(p => genresFreq[p.genre] = (genresFreq[p.genre] || 0) + 1);
        const topGenre = Object.keys(genresFreq).sort((a,b) => genresFreq[b] - genresFreq[a])[0] || "Pop";
        document.getElementById('collage-genre').textContent = topGenre;
    }
    
    // Particle Speed velocity bump to match transition energy
    wrappedParticles.forEach(p => {
        p.speedY = -(Math.random() * 4 + 2);
    });
    
    // Start progress increment timer
    startWrappedTimer(index);
}

function startWrappedTimer(index) {
    const ticks = document.querySelectorAll('.wrapped-tick');
    const tick = ticks[index];
    if (!tick) return;
    
    const fill = tick.querySelector('.wrapped-tick-fill');
    if (!fill) return;
    
    const duration = 6500; // 6.5 seconds per slide
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;
    
    wrappedSlideTimer = setInterval(() => {
        currentStep++;
        wrappedSlideProgress = (currentStep / steps) * 100;
        fill.style.width = `${wrappedSlideProgress}%`;
        
        if (currentStep >= steps) {
            clearInterval(wrappedSlideTimer);
            nextWrappedSlide();
        }
    }, interval);
}

function nextWrappedSlide() {
    const slides = document.querySelectorAll('.wrapped-slide');
    if (wrappedActiveSlide < slides.length - 1) {
        showWrappedSlide(wrappedActiveSlide + 1);
    } else {
        closeWrappedSlideshow();
    }
}

function prevWrappedSlide() {
    if (wrappedActiveSlide > 0) {
        showWrappedSlide(wrappedActiveSlide - 1);
    }
}

function closeWrappedSlideshow() {
    clearInterval(wrappedSlideTimer);
    if (wrappedBackgroundMusic) {
        wrappedBackgroundMusic.pause();
        wrappedBackgroundMusic.src = '';
    }
    
    cancelAnimationFrame(wrappedParticleAnimationId);
    
    document.getElementById('wrapped-overlay').style.display = 'none';
    showToast("Hope you loved your 2026 recap!");
}

function animateCountUp(element, start, end, duration) {
    let startTime = null;
    
    function animate(currentTime) {
        if (!startTime) startTime = currentTime;
        const progress = currentTime - startTime;
        const currentVal = Math.min(Math.floor(start + (progress / duration) * (end - start)), end);
        
        element.textContent = currentVal.toLocaleString();
        
        if (progress < duration) {
            requestAnimationFrame(animate);
        } else {
            element.textContent = end.toLocaleString();
        }
    }
    requestAnimationFrame(animate);
}

function initWrappedParticleCanvas() {
    const canvas = document.getElementById('wrapped-particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    window.onresize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    
    wrappedParticles = [];
    const colors = ['#ec5464', '#d81b60', '#8e24aa', '#1e88e5', '#43a047', '#fb8c00', '#ffffff'];
    for (let i = 0; i < 40; i++) {
        wrappedParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height + canvas.height,
            size: Math.random() * 8 + 3,
            speedY: -(Math.random() * 1.5 + 0.6),
            speedX: Math.random() * 0.8 - 0.4,
            color: colors[Math.floor(Math.random() * colors.length)],
            opacity: Math.random() * 0.4 + 0.2,
            type: Math.random() > 0.6 ? 'star' : 'circle',
            angle: Math.random() * Math.PI,
            spin: Math.random() * 0.03 - 0.015
        });
    }
    
    function animate() {
        if (document.getElementById('wrapped-overlay').style.display === 'none') {
            return;
        }
        
        wrappedParticleAnimationId = requestAnimationFrame(animate);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        wrappedParticles.forEach(p => {
            p.y += p.speedY;
            p.x += p.speedX;
            p.angle += p.spin;
            
            // Decelerate particles down to normal float speeds over time if bumped
            if (p.speedY < -2) {
                p.speedY += 0.05;
            }
            
            if (p.y < -50) {
                p.y = canvas.height + 50;
                p.x = Math.random() * canvas.width;
                p.speedY = -(Math.random() * 1.5 + 0.6);
            }
            
            ctx.save();
            ctx.globalAlpha = p.opacity;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            
            if (p.type === 'circle') {
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
            }
            ctx.restore();
        });
    }
    animate();
}

function saveWrappedPlaylist() {
    let plays = JSON.parse(localStorage.getItem('zynic_play_history')) || generateMockHistory();
    const songsFreq = {};
    plays.forEach(p => songsFreq[p.id] = (songsFreq[p.id] || 0) + 1);
    
    const top20Songs = Object.keys(songsFreq)
        .map(id => {
            const p = plays.find(item => item.id === id);
            return { id: p.id, title: p.title, artist: p.artist, thumbnail: p.thumbnail, type: 'song' };
        })
        .slice(0, 15);
        
    // Retrieve liked tracks cache
    const liked = JSON.parse(localStorage.getItem('zynic_liked')) || [];
    
    // Add top 15 wrapped songs to liked songs so they appear inside their favorites!
    let count = 0;
    top20Songs.forEach(song => {
        if (!liked.some(item => item.id === song.id)) {
            liked.unshift(song);
            count++;
        }
    });
    
    localStorage.setItem('zynic_liked', JSON.stringify(liked));
    state.likedTracks = liked;
    
    showToast(`Saved ${top20Songs.length} tracks to Your Liked Songs playlist!`);
}

// Bind Home Wrapped banner opening trigger on init
document.addEventListener('DOMContentLoaded', () => {
    const wrappedBannerBtn = document.getElementById('home-wrapped-btn');
    if (wrappedBannerBtn) {
        wrappedBannerBtn.onclick = () => {
            initWrappedSlideshow();
        };
    }
});

// Retro Turntable speed toggle and power click listeners
function initTurntableInteractions() {
    if (!state.turntable) {
        state.turntable = {
            speed: 33,
            pitch: 0
        };
    }

    const btn33 = document.getElementById('turntable-speed-33');
    const btn45 = document.getElementById('turntable-speed-45');
    const powerSwitch = document.getElementById('turntable-power-switch');
    const pitchTrack = document.querySelector('.pitch-track');
    const pitchHandle = document.querySelector('.pitch-handle');
    
    const applyPlaybackRate = () => {
        if (!dom.audio) return;
        const baseRate = state.turntable.speed === 45 ? 1.35 : 1.0;
        const pitchFactor = 1.0 + (state.turntable.pitch / 100);
        dom.audio.playbackRate = baseRate * pitchFactor;
    };

    if (btn33 && btn45) {
        btn33.addEventListener('click', () => {
            btn33.classList.add('active');
            btn45.classList.remove('active');
            state.turntable.speed = 33;
            applyPlaybackRate();
            showToast("Turntable Speed: 33 RPM (Normal)");
        });
        
        btn45.addEventListener('click', () => {
            btn45.classList.add('active');
            btn33.classList.remove('active');
            state.turntable.speed = 45;
            applyPlaybackRate();
            showToast("Turntable Speed: 45 RPM (Fast pitch)");
        });
    }
    
    if (powerSwitch) {
        powerSwitch.addEventListener('click', () => {
            if (state.isPlaying) {
                dom.audio.pause();
                setPlaybackState(false);
            } else {
                dom.audio.play().then(() => {
                    setPlaybackState(true);
                    applyPlaybackRate();
                }).catch(err => console.log(err));
            }
        });
    }

    if (pitchTrack && pitchHandle) {
        let isDragging = false;
        const trackHeight = 68;
        const handleHeight = 10;
        const maxTop = trackHeight - handleHeight;

        const updatePitchFromY = (clientY) => {
            const rect = pitchTrack.getBoundingClientRect();
            let relativeY = clientY - rect.top - (handleHeight / 2);
            relativeY = Math.max(0, Math.min(maxTop, relativeY));
            pitchHandle.style.top = `${relativeY}px`;

            const t = relativeY / maxTop;
            const pitch = 8 - (t * 16);
            state.turntable.pitch = pitch;
            applyPlaybackRate();
            
            const labelStr = (pitch >= 0 ? '+' : '') + pitch.toFixed(1) + '%';
            showToast(`Turntable Pitch: ${labelStr}`, "info");
        };

        const onStart = (e) => {
            isDragging = true;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            updatePitchFromY(clientY);
            
            const onMove = (moveEvent) => {
                if (!isDragging) return;
                if (moveEvent.cancelable) moveEvent.preventDefault();
                const currentY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
                updatePitchFromY(currentY);
            };

            const onEnd = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };

        pitchHandle.addEventListener('mousedown', onStart);
        pitchHandle.addEventListener('touchstart', onStart, { passive: false });
        
        pitchTrack.addEventListener('mousedown', (e) => {
            if (e.target === pitchHandle) return;
            updatePitchFromY(e.clientY);
            onStart(e);
        });
    }

    window.applyTurntablePlaybackRate = applyPlaybackRate;
}

// Initialize mini progress bar seeking interactions
function initMiniProgressInteractions() {
    const container = document.getElementById('mini-progress-container');
    const fill = document.getElementById('mini-progress-bar');
    if (!container || !fill) return;

    function seek(e) {
        if (!dom.audio.duration) return;
        const rect = container.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clickX = clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        
        // Update UI immediately for responsiveness
        fill.style.width = `${pct * 100}%`;
        
        const targetTime = pct * dom.audio.duration;
        dom.audio.currentTime = targetTime;
    }

    const onStart = (e) => {
        state.isMiniProgressDragging = true;
        seek(e);
        
        const onMove = (moveEvent) => {
            if (!state.isMiniProgressDragging) return;
            seek(moveEvent);
        };

        const onEnd = () => {
            state.isMiniProgressDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
    };

    container.addEventListener('mousedown', onStart);
    container.addEventListener('touchstart', onStart, { passive: true });
}

// Render active playlist tracks list inside Right Sidebar Up Next container
function renderRightSidebarQueue() {
    const container = document.getElementById('rs-queue-container');
    const countEl = document.getElementById('rs-queue-count');
    if (!container) return;
    
    container.innerHTML = '';
    
    const tracks = state.queue || [];
    if (countEl) {
        countEl.textContent = `${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
    }
    
    if (tracks.length === 0) {
        container.innerHTML = '<div class="rs-queue-empty">Queue is empty</div>';
        return;
    }
    
    tracks.forEach((track, index) => {
        const isActive = index === state.queueIndex;
        const item = document.createElement('div');
        item.className = `rs-queue-item ${isActive ? 'active' : ''}`;
        
        item.addEventListener('click', () => {
            state.queueIndex = index;
            playTrack(track, state.queue);
        });
        
        const thumbnail = track.thumbnail || getTrackThumbnail(track, 80);
        const artist = track.artist || track.subtitle || 'Unknown Artist';
        const duration = track.duration || '0:00';
        
        let statusIndicator = '';
        if (isActive) {
            if (state.isPlaying) {
                statusIndicator = '<i class="fa-solid fa-volume-high rs-q-playing-indicator"></i>';
            } else {
                statusIndicator = '<i class="fa-solid fa-play rs-q-playing-indicator" style="animation: none;"></i>';
            }
        }
        
        item.innerHTML = `
            <img src="${thumbnail}" alt="${track.title}" class="rs-q-thumbnail" onerror="handleImageError(this, '${track.id}', 80)">
            <div class="rs-q-meta">
                <span class="rs-q-title">${track.title}</span>
                <span class="rs-q-artist">${artist}</span>
            </div>
            ${statusIndicator}
            <span class="rs-q-duration">${duration}</span>
        `;
        container.appendChild(item);
    });
}


/* =====================================================================
   HARMONIC CROSSFADE ENGINE — Camelot Key Matching Transitions
   ===================================================================== */

let crossfadeState = {
    crossfadeNode: null,
    targetGainNode: null,
    crossfadeDuration: 3.5, // seconds
    harmonicEnabled: true
};

// Camelot Wheel compatible key map — keys that sound natural together
const CAMELOT_COMPATIBLE = {
    '1A': ['1A','2A','12A','1B'], '2A': ['2A','3A','1A','2B'], '3A': ['3A','4A','2A','3B'],
    '4A': ['4A','5A','3A','4B'], '5A': ['5A','6A','4A','5B'], '6A': ['6A','7A','5A','6B'],
    '7A': ['7A','8A','6A','7B'], '8A': ['8A','9A','7A','8B'], '9A': ['9A','10A','8A','9B'],
    '10A': ['10A','11A','9A','10B'], '11A': ['11A','12A','10A','11B'], '12A': ['12A','1A','11A','12B'],
    '1B': ['1B','2B','12B','1A'], '2B': ['2B','3B','1B','2A'], '3B': ['3B','4B','2B','3A'],
    '4B': ['4B','5B','3B','4A'], '5B': ['5B','6B','4B','5A'], '6B': ['6B','7B','5B','6A'],
    '7B': ['7B','8B','6B','7A'], '8B': ['8B','9B','7B','8A'], '9B': ['9B','10B','8B','9A'],
    '10B': ['10B','11B','9B','10A'], '11B': ['11B','12B','10B','11A'], '12B': ['12B','1B','11B','12A']
};

function getTrackCamelotKey(track) {
    // Simulate key assignment based on track ID hash for demo
    const keys = Object.keys(CAMELOT_COMPATIBLE);
    const hash = (track.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return keys[hash % keys.length];
}

function triggerHarmonicCrossfadeTransition(fromTrack, toTrack, onComplete) {
    if (!crossfadeState.harmonicEnabled || !audioCtx || !sourceNode) {
        if (onComplete) onComplete();
        return;
    }

    const fromKey = getTrackCamelotKey(fromTrack);
    const toKey = getTrackCamelotKey(toTrack);
    const compatible = CAMELOT_COMPATIBLE[fromKey] || [];
    const isHarmonicallyCompatible = compatible.includes(toKey);

    let playbackRateAdjust = 1.0;
    if (!isHarmonicallyCompatible) {
        // Minor tempo nudge (±2%) to approach harmonic territory
        const fromNum = parseInt(fromKey) || 1;
        const toNum = parseInt(toKey) || 1;
        playbackRateAdjust = toNum > fromNum ? 1.02 : 0.98;
    }

    // Fade out current track
    const duration = crossfadeState.crossfadeDuration;
    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(1.0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);

    if (dom.audio) {
        dom.audio.playbackRate = playbackRateAdjust;
    }

    setTimeout(() => {
        if (dom.audio) dom.audio.playbackRate = 1.0;
        if (onComplete) onComplete();
    }, duration * 1000);

    showToast(`🎵 Crossfade${isHarmonicallyCompatible ? ' (Harmonic Key ✓)' : ' (Tempo adjusted ±2%)'}`);
}


/* =====================================================================
   CAST TO DEVICE — Simulated Multi-Room Audio with Per-Device EQ Memory
   ===================================================================== */

let castingPopoverOpen = false;
let activecastDevice = 'this-device';

const CAST_DEVICES = [
    { id: 'this-device', name: 'This Device', icon: 'fa-laptop', type: 'local' },
    { id: 'living-room', name: 'Living Room Speaker', icon: 'fa-tower-broadcast', type: 'cast' },
    { id: 'kitchen-speaker', name: 'Kitchen Speaker', icon: 'fa-kitchen-set', type: 'cast' },
    { id: 'bedroom-headphones', name: 'Bedroom Headphones', icon: 'fa-headphones', type: 'cast' },
    { id: 'car-bluetooth', name: 'Car Bluetooth', icon: 'fa-car', type: 'cast' }
];

function initCastingControls() {
    // Hook cast button if it exists
    const castBtn = document.getElementById('btn-cast-device');
    if (!castBtn) return;

    castBtn.onclick = toggleCastingPopover;
}

function toggleCastingPopover() {
    let popover = document.getElementById('casting-popover');
    if (popover) {
        popover.remove();
        castingPopoverOpen = false;
        return;
    }

    castingPopoverOpen = true;
    popover = document.createElement('div');
    popover.id = 'casting-popover';
    popover.className = 'casting-popover glass-panel';
    popover.innerHTML = `
        <div class="cast-popover-header">
            <h4><i class="fa-solid fa-cast"></i> Cast to Device</h4>
            <button class="cast-close-btn" onclick="document.getElementById('casting-popover').remove()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="cast-devices-list">
            ${CAST_DEVICES.map(device => `
                <div class="cast-device-item ${device.id === activecastDevice ? 'active' : ''}" data-device-id="${device.id}">
                    <i class="fa-solid ${device.icon} cast-device-icon"></i>
                    <div class="cast-device-meta">
                        <span class="cast-device-name">${device.name}</span>
                        <span class="cast-device-type">${device.type === 'local' ? 'Local' : 'Wireless'}</span>
                    </div>
                    ${device.id === activecastDevice ? '<i class="fa-solid fa-check cast-check"></i>' : ''}
                </div>
            `).join('')}
        </div>
        <div class="cast-eq-memory-section">
            <div class="cast-eq-memory-header">
                <span>EQ Profile for ${CAST_DEVICES.find(d => d.id === activecastDevice)?.name}</span>
                <button class="btn btn-sm btn-outline" onclick="saveCastDeviceEQ('${activecastDevice}')">Save Current EQ</button>
            </div>
        </div>
    `;

    popover.querySelectorAll('.cast-device-item').forEach(item => {
        item.onclick = () => switchCastDevice(item.dataset.deviceId);
    });

    const castBtn = document.getElementById('btn-cast-device');
    if (castBtn) {
        castBtn.parentElement.appendChild(popover);
    } else {
        document.body.appendChild(popover);
    }
}

function switchCastDevice(deviceId) {
    activecastDevice = deviceId;
    const device = CAST_DEVICES.find(d => d.id === deviceId);
    if (!device) return;

    // Load saved EQ profile for this device
    loadCastDeviceEQ(deviceId);

    showToast(`🔊 Casting to ${device.name}`);
    document.getElementById('casting-popover')?.remove();

    // Reopen popover with updated selection
    toggleCastingPopover();
}

function saveCastDeviceEQ(deviceId) {
    const eqProfile = {
        bands: eqBandsData,
        device: deviceId,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(`zynic_cast_eq_${deviceId}`, JSON.stringify(eqProfile));
    showToast(`EQ profile saved for ${CAST_DEVICES.find(d => d.id === deviceId)?.name || deviceId}`);
}

function loadCastDeviceEQ(deviceId) {
    const saved = localStorage.getItem(`zynic_cast_eq_${deviceId}`);
    if (!saved) return;
    try {
        const profile = JSON.parse(saved);
        if (profile.bands && Array.isArray(profile.bands)) {
            eqBandsData = profile.bands;
            saveEQState();
            try { rebuildAudioChain(); } catch (e) {}
            try { renderEQBands(); } catch (e) {}
            try { drawEqGraph(); } catch (e) {}
            showToast(`EQ profile loaded for this device`);
        }
    } catch (e) {}
}


/* =====================================================================
   COMPLETELY LIVING ALBUMS — Liner Notes, Commentary, Hidden Tracks
   ===================================================================== */

let livingAlbumState = {
    commentaryAudio: null,
    commentaryDucking: false
};

function initLivingAlbumControls(albumData) {
    // Bind liner notes toggle
    const linerBtn = document.getElementById('btn-toggle-liner-notes');
    if (linerBtn) {
        linerBtn.onclick = () => toggleLinerNotes(albumData);
    }

    // Bind hidden track reveals
    document.querySelectorAll('.hidden-track-reveal').forEach(el => {
        el.onclick = () => revealHiddenTrack(el.dataset.trackId, el.dataset.trackTitle);
    });

    // Bind commentary play buttons
    document.querySelectorAll('.btn-play-commentary').forEach(btn => {
        btn.onclick = () => playArtistCommentary(btn.dataset.commentaryId, btn.dataset.commentaryText);
    });
}

function toggleLinerNotes(albumData) {
    const panel = document.getElementById('liner-notes-panel');
    if (!panel) return;
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible && albumData) {
        panel.innerHTML = `
            <div class="liner-notes-content">
                <h4>Liner Notes</h4>
                <p>${albumData.liner_notes || albumData.description || 'No liner notes available for this album.'}</p>
                ${albumData.credits ? `<div class="liner-credits"><h5>Credits</h5><p>${albumData.credits}</p></div>` : ''}
            </div>
        `;
    }
}

function revealHiddenTrack(trackId, trackTitle) {
    showToast(`🥚 Hidden track unlocked: "${trackTitle || trackId}"!`, 'success');
    if (trackId) {
        playTrack({ id: trackId, title: trackTitle || 'Hidden Track', artist: 'Hidden Artist' });
    }
}

function playArtistCommentary(commentaryId, commentaryText) {
    // Duck current music to 20% during commentary
    if (dom.audio && !livingAlbumState.commentaryDucking) {
        dom.audio.volume = (state.volume || 0.7) * 0.2;
        livingAlbumState.commentaryDucking = true;
    }

    if (commentaryText) {
        showToast(`🎙️ Artist Commentary: "${commentaryText.substring(0, 50)}..."`, 'success');
    }

    // Restore volume after 8 seconds (simulated commentary duration)
    setTimeout(() => {
        if (dom.audio && livingAlbumState.commentaryDucking) {
            dom.audio.volume = state.volume || 0.7;
            livingAlbumState.commentaryDucking = false;
        }
    }, 8000);
}


/* =====================================================================
   INIT ALL PREMIUM FEATURES on DOM Ready
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // Init casting controls (if cast button exists on page)
    initCastingControls();

    // Hook harmonic crossfade into next track transition
    const originalPlayNext = window.playNextTrack;
    if (typeof originalPlayNext === 'function') {
        window.playNextTrack = function() {
            const currentTrack = state.currentTrack;
            const nextIdx = (state.queueIndex || 0) + 1;
            const nextTrack = state.queue?.[nextIdx];
            if (currentTrack && nextTrack && crossfadeState.harmonicEnabled) {
                triggerHarmonicCrossfadeTransition(currentTrack, nextTrack, () => {
                    originalPlayNext.call(this);
                });
            } else {
                originalPlayNext.call(this);
            }
        };
    }
});



/* =====================================================================
   USER PROFILE & ACTIVITY TRACKER
   ===================================================================== */

// ── Activity Logger ──────────────────────────────────────────
const ACTIVITY_KEY = 'zynic_activity_log';
const MAX_ACTIVITY  = 200;

function logActivity(type, label, detail = '') {
    const log = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
    log.unshift({ type, label, detail, ts: Date.now() });
    if (log.length > MAX_ACTIVITY) log.length = MAX_ACTIVITY;
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
}

function getActivityLog() {
    return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || '[]');
}

function fmtTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const ACTIVITY_ICONS = {
    play:   { cls: 'activity-icon-play',   icon: 'fa-play'            },
    search: { cls: 'activity-icon-search', icon: 'fa-magnifying-glass'},
    like:   { cls: 'activity-icon-like',   icon: 'fa-heart'           },
    queue:  { cls: 'activity-icon-queue',  icon: 'fa-list-music'      },
    tab:    { cls: 'activity-icon-tab',    icon: 'fa-compass'         },
    seek:   { cls: 'activity-icon-seek',   icon: 'fa-forward'         },
};

// ── Hook into app events ─────────────────────────────────────
// Wrap playTrack
const _origPlayTrack = window.playTrack;
window.playTrack = function(track, queue, idx) {
    if (track && track.title) {
        logActivity('play', track.title, track.artist || '');
    }
    return typeof _origPlayTrack === 'function' ? _origPlayTrack.call(this, track, queue, idx) : undefined;
};

// Intercept search form submission
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input') || document.querySelector('input[type="search"]');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                logActivity('search', searchInput.value.trim());
            }
        });
    }

    // Tab navigation tracking
    document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            const label = item.querySelector('span')?.textContent?.trim() || tab;
            logActivity('tab', label);
        });
    });

    // Like button tracking
    document.addEventListener('click', (e) => {
        const likeBtn = e.target.closest('#btn-like-track, .like-btn, [data-action="like"], .btn-heart');
        if (likeBtn) {
            const track = window.state?.currentTrack;
            if (track) logActivity('like', track.title || 'Track', track.artist || '');
        }
        const queueBtn = e.target.closest('.btn-add-queue, [data-action="queue"], .queue-btn');
        if (queueBtn) {
            const track = window.state?.currentTrack;
            if (track) logActivity('queue', track.title || 'Track', track.artist || '');
        }
    });

    // Seek tracking (debounced)
    let seekDebounce;
    const progressBar = document.getElementById('progress-bar') || document.querySelector('.progress-slider');
    if (progressBar) {
        progressBar.addEventListener('change', () => {
            clearTimeout(seekDebounce);
            seekDebounce = setTimeout(() => {
                const track = window.state?.currentTrack;
                if (track) logActivity('seek', track.title || 'Track');
            }, 400);
        });
    }
});

// ── Profile Modal ────────────────────────────────────────────
function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;

    const name    = localStorage.getItem('zynic_profile_name') || (window.state?.settings?.displayName) || 'Guest';
    const bio     = localStorage.getItem('zynic_profile_bio') || '';
    const avatarB64 = localStorage.getItem('zynic_profile_avatar');

    document.getElementById('profile-name-input').value = name;
    document.getElementById('profile-bio-input').value  = bio;

    const initEl = document.getElementById('profile-modal-initials');
    const imgEl  = document.getElementById('profile-modal-avatar-img');
    const removeBtn = document.getElementById('profile-avatar-remove');

    if (avatarB64) {
        imgEl.src = avatarB64; imgEl.style.display = 'block';
        initEl.style.display = 'none';
        removeBtn.style.display = 'inline-flex';
    } else {
        imgEl.style.display = 'none'; initEl.style.display = 'block';
        initEl.textContent = initials(name);
        removeBtn.style.display = 'none';
    }

    renderActivityFeed();
    modal.style.display = 'flex';
}

function initials(name) {
    return (name || 'G').split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'G';
}

function renderActivityFeed() {
    const log = getActivityLog();
    const statsEl = document.getElementById('profile-activity-stats');
    const feedEl  = document.getElementById('profile-activity-feed');
    if (!statsEl || !feedEl) return;

    // Stats chips
    const plays   = log.filter(e => e.type === 'play').length;
    const searches= log.filter(e => e.type === 'search').length;
    const likes   = log.filter(e => e.type === 'like').length;
    statsEl.innerHTML = `
        <div class="activity-stat-chip"><span class="activity-stat-num">${plays}</span><span class="activity-stat-label">Plays</span></div>
        <div class="activity-stat-chip"><span class="activity-stat-num">${searches}</span><span class="activity-stat-label">Searches</span></div>
        <div class="activity-stat-chip"><span class="activity-stat-num">${likes}</span><span class="activity-stat-label">Likes</span></div>
    `;

    // Feed entries
    if (log.length === 0) {
        feedEl.innerHTML = '<div class="activity-empty">No activity yet — start listening!</div>';
        return;
    }
    feedEl.innerHTML = log.slice(0, 50).map(entry => {
        const meta = ACTIVITY_ICONS[entry.type] || ACTIVITY_ICONS.tab;
        const detail = entry.detail ? ` <span style="opacity:0.5">· ${entry.detail}</span>` : '';
        return `<div class="activity-entry">
            <div class="activity-entry-icon ${meta.cls}"><i class="fa-solid ${meta.icon}"></i></div>
            <div class="activity-entry-text"><strong>${entry.label}</strong>${detail}</div>
            <div class="activity-entry-time">${fmtTime(entry.ts)}</div>
        </div>`;
    }).join('');
}

// ── Init profile UI ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Open modal on avatar/badge click
    const badge = document.getElementById('rs-user-badge-clickable');
    if (badge) badge.addEventListener('click', openProfileModal);

    const closeBtn = document.getElementById('profile-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        document.getElementById('profile-modal').style.display = 'none';
    });
    document.getElementById('profile-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('profile-modal'))
            document.getElementById('profile-modal').style.display = 'none';
    });

    // Avatar upload
    document.getElementById('profile-avatar-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const b64 = ev.target.result;
            localStorage.setItem('zynic_profile_avatar', b64);
            const imgEl = document.getElementById('profile-modal-avatar-img');
            imgEl.src = b64; imgEl.style.display = 'block';
            document.getElementById('profile-modal-initials').style.display = 'none';
            document.getElementById('profile-avatar-remove').style.display = 'inline-flex';
            applyAvatarToSidebar(b64, null);
        };
        reader.readAsDataURL(file);
    });

    // Remove avatar
    document.getElementById('profile-avatar-remove').addEventListener('click', () => {
        localStorage.removeItem('zynic_profile_avatar');
        document.getElementById('profile-modal-avatar-img').style.display = 'none';
        document.getElementById('profile-modal-initials').style.display = 'block';
        document.getElementById('profile-avatar-remove').style.display = 'none';
        applyAvatarToSidebar(null, document.getElementById('profile-name-input').value);
    });

    // Save profile
    document.getElementById('profile-save-btn').addEventListener('click', () => {
        const name = document.getElementById('profile-name-input').value.trim() || 'Guest';
        const bio  = document.getElementById('profile-bio-input').value.trim();
        localStorage.setItem('zynic_profile_name', name);
        localStorage.setItem('zynic_profile_bio', bio);

        // Sync to settings state
        if (window.state && window.state.settings) {
            window.state.settings.displayName = name;
            if (typeof saveSettingsToStorage === 'function') saveSettingsToStorage();
        }
        if (typeof updateUserProfile === 'function') updateUserProfile();

        // Update bio line
        const sub = document.getElementById('rs-user-sub-text');
        if (sub) sub.textContent = bio || `Listening as ${name}`;

        document.getElementById('profile-modal').style.display = 'none';
        if (typeof showToast === 'function') showToast('Profile saved!', 'success');
    });

    // Clear activity
    document.getElementById('profile-activity-clear').addEventListener('click', () => {
        localStorage.removeItem(ACTIVITY_KEY);
        renderActivityFeed();
    });

    // Restore saved profile on load
    const savedName   = localStorage.getItem('zynic_profile_name');
    const savedBio    = localStorage.getItem('zynic_profile_bio');
    const savedAvatar = localStorage.getItem('zynic_profile_avatar');
    if (savedName && window.state?.settings) window.state.settings.displayName = savedName;
    if (savedBio) {
        const sub = document.getElementById('rs-user-sub-text');
        if (sub) sub.textContent = savedBio;
    }
    if (savedAvatar) applyAvatarToSidebar(savedAvatar, null);
});

function applyAvatarToSidebar(b64, name) {
    const sidebarImg = document.getElementById('rs-user-avatar-img');
    const sidebarInitials = document.getElementById('rs-avatar-initials');
    if (!sidebarImg || !sidebarInitials) return;
    if (b64) {
        sidebarImg.src = b64; sidebarImg.style.display = 'block';
        sidebarInitials.style.display = 'none';
    } else {
        sidebarImg.style.display = 'none';
        sidebarInitials.style.display = 'block';
        sidebarInitials.textContent = initials(name || 'G');
    }
}


/* =====================================================================
   LIVE USER TRACKING — Heartbeat + Live Users Bar
   ===================================================================== */

const LIVE_COLORS = ['#a855f7','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];

function getLiveUserId() {
    let id = localStorage.getItem('zynic_live_id');
    if (!id) { id = 'u_' + Math.random().toString(36).slice(2, 10); localStorage.setItem('zynic_live_id', id); }
    return id;
}

function getLiveColor() {
    let c = localStorage.getItem('zynic_live_color');
    if (!c) { c = LIVE_COLORS[Math.floor(Math.random() * LIVE_COLORS.length)]; localStorage.setItem('zynic_live_color', c); }
    return c;
}

async function sendHeartbeat() {
    const name  = localStorage.getItem('zynic_profile_name') || 'Guest';
    const track = window.state?.currentTrack
        ? { title: window.state.currentTrack.title, artist: window.state.currentTrack.artist || '' }
        : null;
    try {
        await fetch('/api/live/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: getLiveUserId(), name, avatar_color: getLiveColor(), current_track: track })
        });
    } catch (_) {}
}

// Silent heartbeat every 25 seconds — data goes to admin dashboard only
document.addEventListener('DOMContentLoaded', () => {
    sendHeartbeat();
    setInterval(sendHeartbeat, 25000);
});


/* =====================================================================
   MOBILE BOTTOM NAV — sync active state with desktop sidebar
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const mobileNav = document.getElementById('mobile-bottom-nav');
    if (!mobileNav) return;

    mobileNav.querySelectorAll('.nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            // Delegate to the desktop nav item so existing tab logic fires
            const tab = item.dataset.tab;
            const desktopItem = document.querySelector(`.sidebar .nav-item[data-tab="${tab}"]`);
            if (desktopItem) {
                desktopItem.click();
            } else {
                // fallback: trigger navigateToTab directly if it exists
                if (typeof navigateToTab === 'function') navigateToTab(tab);
            }
            // Update mobile active state
            mobileNav.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // Keep mobile nav in sync when desktop nav is clicked
    document.querySelectorAll('.sidebar .nav-item[data-tab]').forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            mobileNav.querySelectorAll('.nav-item').forEach(n => {
                n.classList.toggle('active', n.dataset.tab === tab);
            });
        });
    });
});
