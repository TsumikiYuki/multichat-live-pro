/**
 * MultiChat Live Pro 2.0 - Main Application Logic
 * Full state management, custom wallpaper system, streamer avatars,
 * multi-platform embeds, streamer tools, and UI controllers.
 */

class MultiChatApp {
  constructor() {
    this.STORAGE_KEYS = {
      CHATS: 'multichat_chats_v2',
      SETTINGS: 'multichat_settings_v2',
      PRESETS: 'multichat_presets_v2',
      NOTES: 'multichat_scratchpad_v2',
      CHANNELS: 'multichat_saved_channels_v2',
      WALLPAPER: 'multichat_wallpaper_v2',
      TIMER: 'multichat_timer_v2'
    };

    // Load saved settings or defaults
    this.settings = this.loadJSON(this.STORAGE_KEYS.SETTINGS, {
      theme: 'cyberpunk',
      twitchParent: this.detectDefaultDomain(),
      layout: 'auto',
      obsMode: false
    });

    // Load wallpaper settings (starts clean or with saved preference)
    this.wallpaper = this.loadJSON(this.STORAGE_KEYS.WALLPAPER, {
      url: '',
      opacity: 0.45,
      blur: 0,
      dim: 0.4
    });

    // Load saved active chats (starts empty if none saved)
    this.chats = this.loadJSON(this.STORAGE_KEYS.CHATS, []);

    // Load persistent channels memory (starts completely clean!)
    let loadedChannels = this.loadJSON(this.STORAGE_KEYS.CHANNELS, []);
    // Remove any previous dummy demo channels if they exist
    this.savedChannels = loadedChannels.filter(c => !['c1', 'c2', 'c3', 'c4', 'c5'].includes(c.id));
    this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
    
    // Load presets (starts clean!)
    let loadedPresets = this.loadJSON(this.STORAGE_KEYS.PRESETS, []);
    this.presets = loadedPresets.filter(p => p.id !== 'default-demo');
    this.saveJSON(this.STORAGE_KEYS.PRESETS, this.presets);

    // Current temporary YouTube helper state
    this.currentYTHelper = {
      handle: '',
      customTitle: ''
    };

    // Timer state (persistido: o cronômetro continua contando mesmo se a página recarregar)
    this.timerInterval = null;
    this.timer = this.loadJSON(this.STORAGE_KEYS.TIMER, {
      accumulated: 0,
      startedAt: null,
      visible: false
    });

    // Initialize application
    this.init();
  }

  // ==========================================
  // Initialization & Setup
  // ==========================================
  init() {
    this.applyTheme(this.settings.theme);
    this.applyLayout(this.settings.layout);
    this.applyWallpaper();
    document.body.classList.toggle('obs-mode', Boolean(this.settings.obsMode));

    // Reconstrói as URLs da Twitch com o domínio/tema atual (chats salvos de versões antigas)
    this.chats.forEach(chat => {
      if (chat.type === 'tw') chat.url = this.buildTwitchUrl(chat.channel);
    });
    this.saveChats();

    this.bindEvents();
    this.bindDragAndDrop();
    this.renderChats();
    this.renderChannelsBar();
    this.renderPresetList();
    this.initScratchpad();
    this.initTimer();

    // Check for file:// protocol and show helpful banner
    this.checkProtocolNotice();
  }

  checkProtocolNotice() {
    if (window.location.protocol === 'file:' && !document.getElementById('file-warning-banner')) {
      const banner = document.createElement('div');
      banner.id = 'file-warning-banner';
      banner.className = 'file-warning-banner';
      banner.innerHTML = `
        <div class="banner-content">
          <span class="banner-badge">Aviso de Segurança</span>
          <span>Executando como arquivo (<code>file:///</code>). Para liberar os chats do YouTube diretamente dentro da tela, execute o <strong>Iniciar.bat</strong> ou use o botão <strong>Popout (↗)</strong>.</span>
        </div>
        <div class="banner-actions">
          <button class="btn btn-primary" style="padding: 3px 10px; font-size: 11px;" onclick="app.openServerGuideModal()">
            ⚡ Como Desbloquear (1 Clique)
          </button>
          <button class="control-btn" style="color:white;" onclick="document.getElementById('file-warning-banner').remove()">✕</button>
        </div>
      `;
      document.body.prepend(banner);
    }
  }

  openServerGuideModal() {
    const modal = document.getElementById('modal-server-guide');
    if (modal) modal.classList.add('active');
  }

  // ==========================================
  // Streamer Avatar Fetcher
  // ==========================================
  getAvatarUrl(platform, channelOrHandle) {
    if (!channelOrHandle) return null;
    const clean = channelOrHandle.replace(/^@/, '').trim().toLowerCase();
    if (!clean) return null;

    switch (platform) {
      case 'tw':
        return `https://unavatar.io/twitch/${clean}`;
      case 'yt':
        return `https://unavatar.io/youtube/${clean}`;
      case 'kick':
        return `https://unavatar.io/kick/${clean}`;
      case 'tiktok':
        return `https://unavatar.io/tiktok/${clean}`;
      default:
        return null;
    }
  }

  // ==========================================
  // Custom Wallpaper System
  // ==========================================
  applyWallpaper() {
    if (this.wallpaper && this.wallpaper.url && this.wallpaper.url.trim().length > 0) {
      document.body.classList.add('has-custom-wallpaper');
      document.body.style.setProperty('--custom-wallpaper-url', `url('${this.wallpaper.url}')`);
      document.body.style.setProperty('--wallpaper-opacity', this.wallpaper.opacity ?? 0.45);
      document.body.style.setProperty('--wallpaper-blur', `${this.wallpaper.blur ?? 0}px`);
      document.body.style.setProperty('--wallpaper-dim', this.wallpaper.dim ?? 0.4);
    } else {
      document.body.classList.remove('has-custom-wallpaper');
      document.body.style.removeProperty('--custom-wallpaper-url');
    }
  }

  setWallpaperUrl(url) {
    if (!url) return;
    this.wallpaper.url = url.trim();
    this.saveJSON(this.STORAGE_KEYS.WALLPAPER, this.wallpaper);
    this.applyWallpaper();
    this.syncWallpaperModalInputs();
    this.showToast('Wallpaper aplicado com sucesso!', 'success');
  }

  async handleWallpaperUpload(file) {
    if (!file) return;
    try {
      this.showToast('Processando imagem do wallpaper...', 'info');
      const dataUrl = await this.resizeImage(file, 1920, 0.85);
      this.wallpaper.url = dataUrl;
      this.saveJSON(this.STORAGE_KEYS.WALLPAPER, this.wallpaper);
      this.applyWallpaper();
      this.syncWallpaperModalInputs();
      this.showToast('Wallpaper personalizado definido!', 'success');
    } catch (e) {
      console.error('Erro no upload de wallpaper:', e);
      this.showToast('Erro ao carregar imagem. Tente uma imagem menor.', 'error');
    }
  }

  resizeImage(file, maxDimension = 1920, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  updateWallpaperControl(key, value) {
    this.wallpaper[key] = parseFloat(value);
    this.saveJSON(this.STORAGE_KEYS.WALLPAPER, this.wallpaper);
    this.applyWallpaper();
  }

  removeWallpaper() {
    this.wallpaper.url = '';
    this.saveJSON(this.STORAGE_KEYS.WALLPAPER, this.wallpaper);
    this.applyWallpaper();
    this.syncWallpaperModalInputs();
    this.showToast('Wallpaper removido.', 'info');
  }

  openWallpaperModal() {
    this.syncWallpaperModalInputs();
    const modal = document.getElementById('modal-wallpaper');
    if (modal) modal.classList.add('active');
  }

  syncWallpaperModalInputs() {
    const urlInput = document.getElementById('wallpaper-url-input');
    const opacitySlider = document.getElementById('wp-opacity-slider');
    const opacityVal = document.getElementById('wp-opacity-val');
    const blurSlider = document.getElementById('wp-blur-slider');
    const blurVal = document.getElementById('wp-blur-val');
    const dimSlider = document.getElementById('wp-dim-slider');
    const dimVal = document.getElementById('wp-dim-val');

    if (urlInput) urlInput.value = this.wallpaper.url && !this.wallpaper.url.startsWith('data:') ? this.wallpaper.url : '';
    
    if (opacitySlider) {
      opacitySlider.value = this.wallpaper.opacity ?? 0.45;
      if (opacityVal) opacityVal.innerText = `${Math.round((this.wallpaper.opacity ?? 0.45) * 100)}%`;
    }

    if (blurSlider) {
      blurSlider.value = this.wallpaper.blur ?? 0;
      if (blurVal) blurVal.innerText = `${this.wallpaper.blur ?? 0}px`;
    }

    if (dimSlider) {
      dimSlider.value = this.wallpaper.dim ?? 0.4;
      if (dimVal) dimVal.innerText = `${Math.round((this.wallpaper.dim ?? 0.4) * 100)}%`;
    }
  }

  // ==========================================
  // URL Builders & Smart Platform Parsers
  // ==========================================
  detectDefaultDomain() {
    if (window.location.hostname && window.location.hostname.length > 0) {
      return window.location.hostname;
    }
    return 'localhost';
  }

  getTwitchParent() {
    return this.settings.twitchParent || this.detectDefaultDomain();
  }

  buildTwitchUrl(channel) {
    const parent = encodeURIComponent(this.getTwitchParent());
    const dark = this.settings.theme === 'light' ? '' : '&darkpopout=true';
    return `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${parent}${dark}`;
  }

  buildYouTubeUrl(id) {
    const domain = encodeURIComponent(this.detectDefaultDomain());
    return `https://www.youtube.com/live_chat?v=${id}&embed_domain=${domain}`;
  }

  buildKickUrl(channel) {
    return `https://kick.com/popout/${channel}/chat`;
  }

  buildTikTokUrl(username) {
    return `https://www.tiktok.com/@${username}/live`;
  }

  buildOwncastUrl(server) {
    const base = /^https?:\/\//i.test(server) ? server : `https://${server}`;
    const url = new URL(base);
    return `${url.origin}/embed/chat/readwrite`;
  }

  // Página de login de cada plataforma. O chat incorporado usa a sessão do navegador,
  // então depois de entrar na conta basta recarregar o chat para poder mandar mensagens.
  getLoginUrl(type) {
    return {
      tw: 'https://www.twitch.tv/login',
      yt: 'https://accounts.google.com/ServiceLogin?service=youtube&continue=' + encodeURIComponent('https://www.youtube.com/'),
      kick: 'https://kick.com/',
      trovo: 'https://trovo.live/',
      tiktok: 'https://www.tiktok.com/login'
    }[type] || null;
  }

  loginChat(id) {
    const chat = this.chats.find(c => c.id === id);
    const loginUrl = chat && this.getLoginUrl(chat.type);
    if (!loginUrl) return;

    const popup = window.open(loginUrl, `login_${chat.type}`, 'width=520,height=720,menubar=no,toolbar=no,location=yes,resizable=yes,scrollbars=yes');
    if (!popup) {
      this.showToast('O navegador bloqueou a janela de login. Permita pop-ups para este site.', 'error');
      return;
    }

    this.showToast(`Entre na sua conta ${this.getPlatformLabel(chat.type)} e feche a janela. O chat recarrega sozinho.`, 'info', 6000);

    // Quando a janela de login fecha, recarrega todos os chats daquela plataforma
    clearInterval(this.loginWatchers?.[chat.type]);
    this.loginWatchers = this.loginWatchers || {};
    this.loginWatchers[chat.type] = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(this.loginWatchers[chat.type]);
      this.chats.filter(c => c.type === chat.type).forEach(c => this.reloadChat(c.id, true));
      this.showToast('Chat recarregado. Se ainda não der para digitar, veja a dica em "Sobre & OBS".', 'success', 6000);
    }, 800);
  }

  buildTrovoUrl(channel) {
    return `https://trovo.live/chat/${channel}`;
  }

  /**
   * Universal Smart Platform Detector
   * Detects platform from raw input without requiring the user to switch dropdowns.
   */
  detectPlatform(rawInput, fallbackType = 'auto') {
    if (!rawInput) return fallbackType === 'auto' ? 'tw' : fallbackType;
    const input = rawInput.trim().toLowerCase();

    if (input.includes('youtube.com') || input.includes('youtu.be')) return 'yt';
    if (input.includes('twitch.tv')) return 'tw';
    if (input.includes('kick.com')) return 'kick';
    if (input.includes('tiktok.com')) return 'tiktok';
    if (input.includes('trovo.live')) return 'trovo';

    if (fallbackType && fallbackType !== 'auto') {
      return fallbackType;
    }

    return 'tw';
  }

  extractYouTubeId(input) {
    if (!input) return null;
    input = input.trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    try {
      const url = new URL(input.startsWith('http') ? input : `https://${input}`);
      
      if (url.searchParams.has('v')) {
        return url.searchParams.get('v');
      }

      if (url.pathname.includes('/live/')) {
        const parts = url.pathname.split('/live/');
        return parts[1] ? parts[1].split('/')[0].split('?')[0] : null;
      }

      if (url.pathname.includes('/live_chat')) {
        return url.searchParams.get('v');
      }

      if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1).split('?')[0];
      }

      const paths = url.pathname.split('/').filter(Boolean);
      if (paths.length > 0 && paths[paths.length - 1].length === 11) {
        return paths[paths.length - 1];
      }
    } catch (e) {
      const match = input.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|live\/|live_chat\?v=))([\w-]{11})/);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  extractYouTubeHandle(input) {
    if (!input) return null;
    input = input.trim();

    if (this.extractYouTubeId(input)) return null;

    if (input.startsWith('@')) {
      return input.slice(1);
    }

    if (input.includes('youtube.com/@')) {
      const match = input.match(/youtube\.com\/@([a-zA-Z0-9_.-]+)/i);
      if (match) return match[1];
    }

    if (input.includes('youtube.com/c/')) {
      const match = input.match(/youtube\.com\/c\/([a-zA-Z0-9_.-]+)/i);
      if (match) return match[1];
    }

    if (/^[a-zA-Z0-9_-]{3,35}$/.test(input)) {
      return input;
    }

    return null;
  }

  extractTwitchChannel(input) {
    if (!input) return null;
    input = input.trim().replace(/^@/, '');
    
    if (input.includes('twitch.tv/')) {
      try {
        const url = new URL(input.startsWith('http') ? input : `https://${input}`);
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length > 0) return parts[0].toLowerCase();
      } catch (e) {
        const match = input.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
        if (match) return match[1].toLowerCase();
      }
    }

    return input.toLowerCase();
  }

  extractKickChannel(input) {
    if (!input) return null;
    input = input.trim();
    if (input.includes('kick.com/')) {
      try {
        const url = new URL(input.startsWith('http') ? input : `https://${input}`);
        const parts = url.pathname.split('/').filter(Boolean);
        const clean = parts.filter(p => p !== 'popout' && p !== 'chat');
        if (clean.length > 0) return clean[0].toLowerCase();
      } catch (e) {
        const match = input.match(/kick\.com\/([a-zA-Z0-9_]+)/i);
        if (match) return match[1].toLowerCase();
      }
    }
    return input.toLowerCase();
  }

  extractTikTokUser(input) {
    if (!input) return null;
    input = input.trim().replace(/^@/, '');
    if (input.includes('tiktok.com/@')) {
      const match = input.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/i);
      if (match) return match[1].toLowerCase();
    }
    return input.toLowerCase();
  }

  // ==========================================
  // Chat Management
  // ==========================================
  addChat({ type = 'auto', input, customTitle, autoRemember = true, handle = '' }) {
    if (!input) {
      this.showToast('Por favor, informe o link ou canal.', 'error');
      return false;
    }

    const resolvedType = this.detectPlatform(input, type);

    let url = '';
    let name = customTitle || '';
    let channel = '';
    handle = (handle || '').replace(/^@/, '');

    switch (resolvedType) {
      case 'yt': {
        const id = this.extractYouTubeId(input);
        if (!id) {
          const chHandle = this.extractYouTubeHandle(input);
          if (chHandle) {
            this.openYouTubeHelper(chHandle, customTitle);
            return false;
          }
          this.showToast('Cole o link da live do YouTube (do navegador ou de Compartilhar).', 'error', 4500);
          return false;
        }
        channel = id;
        url = this.buildYouTubeUrl(id);
        name = name || `YouTube Live`;
        break;
      }

      case 'tw': {
        channel = this.extractTwitchChannel(input);
        if (!channel) {
          this.showToast('Nome do canal Twitch inválido.', 'error');
          return false;
        }
        url = this.buildTwitchUrl(channel);
        name = name || `${channel}`;
        handle = handle || channel;
        break;
      }

      case 'kick': {
        channel = this.extractKickChannel(input);
        if (!channel) {
          this.showToast('Canal Kick inválido.', 'error');
          return false;
        }
        url = this.buildKickUrl(channel);
        name = name || channel;
        handle = handle || channel;
        break;
      }

      case 'tiktok': {
        channel = this.extractTikTokUser(input);
        if (!channel) {
          this.showToast('Usuário do TikTok inválido.', 'error');
          return false;
        }
        url = this.buildTikTokUrl(channel);
        name = name || `@${channel}`;
        handle = handle || channel;
        break;
      }

      case 'trovo': {
        channel = input.trim();
        url = this.buildTrovoUrl(channel);
        name = name || channel;
        break;
      }

      case 'owncast': {
        try {
          url = this.buildOwncastUrl(input.trim());
        } catch (e) {
          this.showToast('Endereço do servidor Owncast inválido.', 'error');
          return false;
        }
        channel = new URL(url).host;
        name = name || channel;
        break;
      }

      case 'custom': {
        url = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
        try {
          new URL(url);
        } catch (e) {
          this.showToast('URL inválida.', 'error');
          return false;
        }
        channel = url;
        name = name || 'Chat Personalizado';
        break;
      }

      default:
        this.showToast('Plataforma desconhecida.', 'error');
        return false;
    }

    const duplicate = this.chats.find(c => c.type === resolvedType && c.channel === channel);
    if (duplicate) {
      this.highlightChat(duplicate.id);
      this.showToast(`"${duplicate.name}" já está aberto na tela!`, 'info');
      return true;
    }

    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: resolvedType,
      name,
      channel,
      handle,
      url,
      zoom: 100,
      isPinned: false,
      isMinimized: false
    };

    this.chats.push(newChat);
    this.saveChats();
    this.renderChats();

    // Automatically remember channel in persistent memory
    if (autoRemember) {
      this.rememberChannel({
        platform: resolvedType,
        name: name,
        identifier: channel,
        channelHandle: handle || channel,
        isFavorite: false
      });
    }

    this.renderChannelsBar();
    this.showToast(`Chat "${name}" conectado com sucesso!`, 'success');
    return true;
  }

  removeChat(id) {
    const chatIndex = this.chats.findIndex(c => c.id === id);
    if (chatIndex > -1) {
      const removed = this.chats[chatIndex];
      this.chats.splice(chatIndex, 1);
      this.saveChats();
      this.renderChats();
      this.renderChannelsBar();
      this.showToast(`Chat "${removed.name}" removido.`, 'info');
    }
  }

  renameChat(id) {
    const chat = this.chats.find(c => c.id === id);
    if (!chat) return;

    const titleEl = document.querySelector(`#box-${id} .chat-title`);
    if (!titleEl) {
      const newName = prompt('Novo apelido para este chat:', chat.name);
      if (newName && newName.trim()) {
        chat.name = newName.trim();
        this.saveChats();
        this.renderChats();
      }
      return;
    }

    // Edição inline: Enter salva, Esc cancela, clicar fora salva
    const header = titleEl.closest('.chat-header');
    if (header) header.draggable = false;
    titleEl.contentEditable = 'true';
    titleEl.classList.add('editing');
    titleEl.focus();
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      titleEl.contentEditable = 'false';
      if (header) header.draggable = true;
      const newName = titleEl.innerText.trim();
      if (save && newName && newName !== chat.name) {
        chat.name = newName;
        this.saveChats();
        this.showToast('Nome atualizado!', 'success', 1800);
      }
      this.renderChats();
    };

    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    titleEl.addEventListener('blur', () => finish(true), { once: true });
  }

  highlightChat(id) {
    const box = document.getElementById(`box-${id}`);
    if (!box) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.classList.remove('flash');
    void box.offsetWidth;
    box.classList.add('flash');
    setTimeout(() => box.classList.remove('flash'), 1600);
  }

  updateYouTubeChatLive(id) {
    const chat = this.chats.find(c => c.id === id);
    if (!chat || chat.type !== 'yt') return;

    const newLink = prompt('Cole o novo link da live do YouTube (do navegador ou de Compartilhar):');
    if (!newLink) return;

    const newId = this.extractYouTubeId(newLink);
    if (!newId) {
      this.showToast('Link do YouTube inválido. Copie o link da barra do navegador.', 'error');
      return;
    }

    const oldId = chat.channel;
    chat.channel = newId;
    chat.url = this.buildYouTubeUrl(newId);
    this.saveChats();
    this.renderChats();

    const memoryChan = this.savedChannels.find(c => c.platform === 'yt' && (c.name === chat.name || c.identifier === oldId));
    if (memoryChan) {
      memoryChan.identifier = newId;
      this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
      this.renderChannelsBar();
    }

    this.showToast(`Live de "${chat.name}" atualizada!`, 'success');
  }

  togglePinChat(id) {
    const chat = this.chats.find(c => c.id === id);
    if (chat) {
      chat.isPinned = !chat.isPinned;
      this.saveChats();
      this.renderChats();
    }
  }

  toggleMinimizeChat(id) {
    const chat = this.chats.find(c => c.id === id);
    if (chat) {
      chat.isMinimized = !chat.isMinimized;
      this.saveChats();
      this.renderChats();
    }
  }

  reloadChat(id, quiet = false) {
    const chatBox = document.getElementById(`box-${id}`);
    if (!chatBox) return;

    const iframe = chatBox.querySelector('iframe');
    const loader = chatBox.querySelector('.chat-loader');

    if (iframe) {
      if (loader) loader.style.display = 'flex';
      const currentSrc = iframe.src;
      iframe.src = 'about:blank';
      setTimeout(() => {
        iframe.src = currentSrc;
      }, 100);
      if (!quiet) this.showToast('Recarregando chat...', 'info');
    }
  }

  openPopout(id) {
    const chat = this.chats.find(c => c.id === id);
    if (!chat) return;

    let popoutUrl = chat.url;
    if (chat.type === 'yt') {
      popoutUrl = `https://www.youtube.com/live_chat?v=${chat.channel}`;
    } else if (chat.type === 'tiktok') {
      popoutUrl = `https://www.tiktok.com/@${chat.channel}/live`;
    }

    const popup = window.open(
      popoutUrl,
      `popout_${chat.id}`,
      'width=420,height=680,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes'
    );

    if (popup) {
      popup.focus();
      this.showToast(`Popout de "${chat.name}" aberto em nova janela.`, 'success');
    } else {
      this.showToast('O navegador bloqueou a janela pop-up. Permita pop-ups para este site.', 'error');
    }
  }

  adjustZoom(id, delta) {
    const chat = this.chats.find(c => c.id === id);
    if (!chat) return;

    let newZoom = delta === 0 ? 100 : (chat.zoom || 100) + delta;
    if (newZoom < 60) newZoom = 60;
    if (newZoom > 160) newZoom = 160;

    chat.zoom = newZoom;
    this.saveChats();
    
    const box = document.getElementById(`box-${id}`);
    if (box) {
      const iframeContainer = box.querySelector('.iframe-container');
      const zoomBadge = box.querySelector('.zoom-badge');
      if (iframeContainer) {
        this.applyZoomStyles(iframeContainer, newZoom);
      }
      if (zoomBadge) {
        zoomBadge.innerText = `${newZoom}%`;
      }
    }
  }

  applyZoomStyles(container, zoom) {
    const scale = zoom / 100;
    container.style.transform = `scale(${scale})`;
    container.style.width = `${100 / scale}%`;
    container.style.height = `${100 / scale}%`;
  }

  moveChat(id, direction) {
    const ordered = this.getDisplayOrder();
    const index = ordered.findIndex(c => c.id === id);
    const neighbor = ordered[index + direction];
    if (index === -1 || !neighbor) return;
    this.reorderChat(id, neighbor.id);
  }

  clearAllChats() {
    if (this.chats.length === 0) return;
    if (confirm('Tem certeza de que deseja remover todos os chats abertos na tela? (Seus canais continuarão salvos na memória)')) {
      this.chats = [];
      this.saveChats();
      this.renderChats();
      this.renderChannelsBar();
      this.showToast('Todos os chats foram fechados.', 'info');
    }
  }

  // ==========================================
  // Persistent Channels Memory (Favoritos & Histórico)
  // ==========================================
  rememberChannel({ platform, name, identifier, channelHandle, isFavorite = false }) {
    if (!name && !identifier && !channelHandle) return;

    const cleanHandle = channelHandle ? channelHandle.replace(/^@/, '') : '';
    const cleanId = identifier || '';

    const existingIndex = this.savedChannels.findIndex(c => 
      c.platform === platform && (
        (cleanId && c.identifier === cleanId) || 
        (cleanHandle && c.channelHandle && c.channelHandle.toLowerCase() === cleanHandle.toLowerCase()) ||
        (name && c.name.toLowerCase() === name.toLowerCase())
      )
    );

    if (existingIndex > -1) {
      if (cleanId) this.savedChannels[existingIndex].identifier = cleanId;
      if (cleanHandle) this.savedChannels[existingIndex].channelHandle = cleanHandle;
      if (name && !this.savedChannels[existingIndex].name) this.savedChannels[existingIndex].name = name;
    } else {
      this.savedChannels.unshift({
        id: 'chan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        platform,
        name: name || cleanHandle || cleanId,
        identifier: cleanId,
        channelHandle: cleanHandle,
        isFavorite: Boolean(isFavorite),
        createdAt: new Date().toLocaleDateString('pt-BR')
      });
    }

    this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
    this.renderChannelsBar();
  }

  toggleFavoriteChannel(channelId) {
    const channel = this.savedChannels.find(c => c.id === channelId);
    if (channel) {
      channel.isFavorite = !channel.isFavorite;
      this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
      this.renderChannelsBar();
      this.renderChannelsMemoryModal();
    }
  }

  removeChannelFromMemory(channelId) {
    const index = this.savedChannels.findIndex(c => c.id === channelId);
    if (index > -1) {
      const removed = this.savedChannels.splice(index, 1)[0];
      this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
      this.renderChannelsBar();
      this.renderChannelsMemoryModal();
      this.showToast(`Canal "${removed.name}" removido da memória.`, 'info');
    }
  }

  connectSavedChannel(channelId) {
    const channel = this.savedChannels.find(c => c.id === channelId);
    if (!channel) return;

    const isOpen = this.chats.some(c => 
      c.type === channel.platform && (c.channel === channel.identifier || c.name.toLowerCase() === channel.name.toLowerCase())
    );

    if (isOpen) {
      this.showToast(`O canal "${channel.name}" já está aberto na tela!`, 'info');
      const existing = this.chats.find(c => c.type === channel.platform && (c.channel === channel.identifier || c.name.toLowerCase() === channel.name.toLowerCase()));
      if (existing) this.highlightChat(existing.id);
      return;
    }

    if (channel.platform === 'yt') {
      if (channel.identifier) {
        this.addChat({
          type: 'yt',
          input: channel.identifier,
          customTitle: channel.name,
          handle: channel.channelHandle,
          autoRemember: false
        });
      } else {
        this.openYouTubeHelper(channel.channelHandle || channel.name, channel.name);
      }
    } else {
      this.addChat({
        type: channel.platform,
        input: channel.identifier || channel.channelHandle || channel.name,
        customTitle: channel.name,
        autoRemember: false
      });
    }
  }

  renderChannelsBar() {
    const container = document.getElementById('channels-chips-container');
    if (!container) return;

    if (this.savedChannels.length === 0) {
      container.innerHTML = `<span style="font-size: 11px; color: var(--text-dim); display:flex; align-items:center; gap:6px;">✨ Adicione seus canais ou lives favoritas para ficarem salvos aqui com 1 clique!</span>`;
      return;
    }

    const sorted = [...this.savedChannels].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

    container.innerHTML = sorted.map(ch => {
      const isOpen = this.chats.some(c => c.type === ch.platform && (c.channel === ch.identifier || c.name.toLowerCase() === ch.name.toLowerCase()));
      const badgeLabel = this.getBadgeLabel(ch.platform);
      const avatarUrl = this.getAvatarUrl(ch.platform, ch.channelHandle || (ch.platform === 'yt' ? '' : ch.identifier));

      return `
        <div class="channel-chip ${isOpen ? 'active' : ''}" onclick="app.connectSavedChannel('${ch.id}')" title="Clique para conectar ou destacar">
          ${avatarUrl ? `
            <img 
              src="${avatarUrl}" 
              class="channel-chip-avatar" 
              alt="${this.escapeHTML(ch.name)}" 
              onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';"
            >
          ` : ''}
          <span class="channel-chip-badge platform-badge ${ch.platform}" style="${avatarUrl ? 'display:none;' : ''}">${badgeLabel}</span>
          <span class="channel-chip-name">${this.escapeHTML(ch.name)}</span>
          ${ch.isFavorite ? '<span class="channel-chip-star">★</span>' : ''}
          ${isOpen ? '<span class="channel-chip-live" title="Aberto na tela"></span>' : ''}
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // YouTube 1-Click Helper
  // ==========================================
  openYouTubeHelper(handle, customTitle = '') {
    this.currentYTHelper = {
      handle: handle.replace(/^@/, ''),
      customTitle: customTitle || handle
    };

    const handleDisplay = document.getElementById('yt-helper-handle');
    if (handleDisplay) {
      handleDisplay.innerText = `@${this.currentYTHelper.handle}`;
    }

    const input = document.getElementById('yt-helper-paste-input');
    if (input) input.value = '';

    const modal = document.getElementById('modal-yt-helper');
    if (modal) modal.classList.add('active');
  }

  openYouTubeChannelLive() {
    if (!this.currentYTHelper.handle) return;
    const url = `https://www.youtube.com/@${this.currentYTHelper.handle}/live`;
    window.open(url, '_blank');
    this.showToast('Página do canal aberta no YouTube! Copie o link da barra do navegador e cole aqui.', 'info', 5000);
  }

  submitYouTubeHelper() {
    const input = document.getElementById('yt-helper-paste-input');
    if (!input || !input.value.trim()) {
      this.showToast('Por favor, cole o link da live copiado do YouTube.', 'error');
      return;
    }

    const videoId = this.extractYouTubeId(input.value);
    if (!videoId) {
      this.showToast('Link do YouTube não reconhecido. Copie o link do navegador ou do botão Compartilhar.', 'error');
      return;
    }

    const handle = this.currentYTHelper.handle;
    const name = this.currentYTHelper.customTitle || `@${handle}`;

    this.addChat({
      type: 'yt',
      input: videoId,
      customTitle: name,
      handle,
      autoRemember: false
    });

    this.rememberChannel({
      platform: 'yt',
      name: name,
      identifier: videoId,
      channelHandle: handle,
      isFavorite: true
    });

    this.closeAllModals();
    this.showToast(`Canal @${handle} conectado e salvo nos Favoritos!`, 'success');
  }

  // ==========================================
  // Presets & Backup
  // ==========================================
  saveCurrentAsPreset() {
    if (this.chats.length === 0) {
      this.showToast('Adicione pelo menos um chat antes de salvar um preset.', 'error');
      return;
    }

    const name = prompt('Nome para este Preset (ex: "Minhas Lives de Sexta", "Setup Stream"):');
    if (!name || name.trim().length === 0) return;

    const preset = {
      id: 'preset_' + Date.now(),
      name: name.trim(),
      chats: JSON.parse(JSON.stringify(this.chats)),
      createdAt: new Date().toLocaleDateString('pt-BR')
    };

    this.presets.push(preset);
    this.saveJSON(this.STORAGE_KEYS.PRESETS, this.presets);
    this.renderPresetList();
    this.showToast(`Preset "${preset.name}" salvo com sucesso!`, 'success');
  }

  loadPreset(presetId) {
    const preset = this.presets.find(p => p.id === presetId);
    if (!preset) return;

    if (this.chats.length > 0 && !confirm(`Carregar o preset "${preset.name}" substituirá os chats atuais. Continuar?`)) {
      return;
    }

    this.chats = JSON.parse(JSON.stringify(preset.chats));
    this.saveChats();
    this.renderChats();
    this.renderChannelsBar();
    this.closeAllModals();
    this.showToast(`Preset "${preset.name}" carregado!`, 'success');
  }

  deletePreset(presetId) {
    const index = this.presets.findIndex(p => p.id === presetId);
    if (index > -1) {
      const removed = this.presets.splice(index, 1)[0];
      this.saveJSON(this.STORAGE_KEYS.PRESETS, this.presets);
      this.renderPresetList();
      this.showToast(`Preset "${removed.name}" excluído.`, 'info');
    }
  }

  renderPresetList() {
    const container = document.getElementById('preset-list');
    if (!container) return;

    if (this.presets.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 16px; color: var(--text-dim); font-size: 13px;">Nenhum preset salvo.</div>`;
      return;
    }

    container.innerHTML = this.presets.map(p => `
      <div class="preset-item">
        <div class="preset-info">
          <span class="preset-name">${this.escapeHTML(p.name)}</span>
          <span class="preset-count">${p.chats.length} chat(s) • ${p.createdAt || 'Preset'}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="app.loadPreset('${p.id}')">Carregar</button>
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="app.deletePreset('${p.id}')">✕</button>
        </div>
      </div>
    `).join('');
  }

  exportConfig() {
    const exportData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      wallpaper: this.wallpaper,
      chats: this.chats,
      presets: this.presets,
      savedChannels: this.savedChannels
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multichat_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Configurações e Canais exportados com sucesso!', 'success');
  }

  importConfig(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.chats && Array.isArray(data.chats)) {
          this.chats = data.chats;
          this.saveChats();
        }
        if (data.presets && Array.isArray(data.presets)) {
          this.presets = data.presets;
          this.saveJSON(this.STORAGE_KEYS.PRESETS, this.presets);
        }
        if (data.savedChannels && Array.isArray(data.savedChannels)) {
          this.savedChannels = data.savedChannels;
          this.saveJSON(this.STORAGE_KEYS.CHANNELS, this.savedChannels);
        }
        if (data.wallpaper) {
          this.wallpaper = Object.assign(this.wallpaper, data.wallpaper);
          this.saveJSON(this.STORAGE_KEYS.WALLPAPER, this.wallpaper);
          this.applyWallpaper();
        }
        if (data.settings) {
          this.settings = Object.assign(this.settings, data.settings);
          this.saveJSON(this.STORAGE_KEYS.SETTINGS, this.settings);
          this.applyTheme(this.settings.theme);
          this.applyLayout(this.settings.layout);
        }

        this.renderChats();
        this.renderChannelsBar();
        this.renderPresetList();
        this.closeAllModals();
        this.showToast('Backup restaurado com sucesso!', 'success');
      } catch (err) {
        this.showToast('Erro ao importar arquivo JSON: formato inválido.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ==========================================
  // Layout & Theme Controls
  // ==========================================
  applyTheme(theme) {
    const wasLight = this.settings.theme === 'light';
    this.settings.theme = theme;
    document.body.setAttribute('data-theme', theme);
    this.saveJSON(this.STORAGE_KEYS.SETTINGS, this.settings);

    // O chat da Twitch tem modo claro/escuro próprio: acompanha o tema do app
    if (wasLight !== (theme === 'light') && this.chats.some(c => c.type === 'tw')) {
      this.chats.forEach(chat => {
        if (chat.type === 'tw') chat.url = this.buildTwitchUrl(chat.channel);
      });
      this.saveChats();
      this.renderChats();
    }
    
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  cycleTheme() {
    const themes = ['cyberpunk', 'slate', 'midnight', 'sunset', 'matrix', 'light'];
    const currentIndex = themes.indexOf(this.settings.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    this.applyTheme(nextTheme);
    const names = { cyberpunk: 'Cyber Neon', slate: 'Slate Escuro', midnight: 'Midnight', sunset: 'Sunset', matrix: 'Matrix', light: 'Clean Light' };
    this.showToast(`Tema: ${names[nextTheme]}`, 'info', 1800);
  }

  applyLayout(layout) {
    this.settings.layout = layout;
    const grid = document.getElementById('grid');
    if (grid) {
      grid.className = `grid layout-${layout}`;
    }

    document.querySelectorAll('.layout-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });

    this.saveJSON(this.STORAGE_KEYS.SETTINGS, this.settings);
  }

  toggleOBSMode() {
    this.settings.obsMode = !this.settings.obsMode;
    document.body.classList.toggle('obs-mode', this.settings.obsMode);
    
    if (this.settings.obsMode) {
      this.showToast('Modo OBS ativado (Fundo transparente). Pressione F2 para sair.', 'info', 4000);
    } else {
      this.showToast('Modo OBS desativado.', 'info');
    }
    this.saveJSON(this.STORAGE_KEYS.SETTINGS, this.settings);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // ==========================================
  // Streamer Tools: Timer & Scratchpad
  // ==========================================
  initTimer() {
    const widget = document.getElementById('floating-timer');
    if (widget) widget.classList.toggle('hidden', !this.timer.visible);
    if (this.timer.startedAt) this.startTimerTick();
    this.updateTimerDisplay();
  }

  get isTimerRunning() {
    return Boolean(this.timer.startedAt);
  }

  get timerSeconds() {
    const running = this.timer.startedAt ? (Date.now() - this.timer.startedAt) / 1000 : 0;
    return Math.floor(this.timer.accumulated + running);
  }

  saveTimer() {
    this.saveJSON(this.STORAGE_KEYS.TIMER, this.timer);
  }

  toggleTimer() {
    if (this.isTimerRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  startTimerTick() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.updateTimerDisplay(), 500);
    const playBtn = document.getElementById('timer-play-btn');
    if (playBtn) playBtn.innerHTML = '⏸';
    document.getElementById('floating-timer')?.classList.add('running');
  }

  startTimer() {
    if (this.isTimerRunning) return;
    this.timer.startedAt = Date.now();
    this.saveTimer();
    this.startTimerTick();
  }

  pauseTimer() {
    if (this.timer.startedAt) {
      this.timer.accumulated += (Date.now() - this.timer.startedAt) / 1000;
      this.timer.startedAt = null;
      this.saveTimer();
    }
    clearInterval(this.timerInterval);
    const playBtn = document.getElementById('timer-play-btn');
    if (playBtn) playBtn.innerHTML = '▶';
    document.getElementById('floating-timer')?.classList.remove('running');
    this.updateTimerDisplay();
  }

  resetTimer() {
    this.pauseTimer();
    this.timer.accumulated = 0;
    this.saveTimer();
    this.updateTimerDisplay();
  }

  updateTimerDisplay() {
    const total = this.timerSeconds;
    const hrs = String(Math.floor(total / 3600)).padStart(2, '0');
    const mins = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');

    const el = document.getElementById('floating-timer-digits');
    if (el) el.innerText = `${hrs}:${mins}:${secs}`;
  }

  toggleTimerWidget() {
    const widget = document.getElementById('floating-timer');
    if (widget) {
      this.timer.visible = widget.classList.toggle('hidden') === false;
      this.saveTimer();
    }
  }

  initScratchpad() {
    const area = document.getElementById('scratchpad-text');
    if (!area) return;

    const saved = localStorage.getItem(this.STORAGE_KEYS.NOTES) || '';
    area.value = saved;

    area.addEventListener('input', () => {
      localStorage.setItem(this.STORAGE_KEYS.NOTES, area.value);
    });
  }

  // ==========================================
  // Render Engine
  // ==========================================
  // Os cards são atualizados no lugar (diff por id) e reordenados via CSS `order`,
  // assim fixar, mover, renomear ou dar zoom NÃO recarrega os iframes dos outros chats.
  getDisplayOrder() {
    return [...this.chats].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));
  }

  getPlatformLabel(type) {
    return {
      tw: 'Twitch',
      yt: 'YouTube',
      kick: 'Kick',
      tiktok: 'TikTok',
      trovo: 'Trovo',
      owncast: 'Owncast',
      custom: 'Custom'
    }[type] || type;
  }

  getBadgeLabel(type) {
    return type === 'yt' ? 'YT' : type === 'tw' ? 'TW' : type === 'owncast' ? 'OC' : type === 'custom' ? '★' : type.slice(0, 2).toUpperCase();
  }

  renderEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <path d="M8 10h.01"></path><path d="M12 10h.01"></path><path d="M16 10h.01"></path>
          </svg>
        </div>
        <h2 class="empty-title">Junte todos os seus chats em uma tela</h2>
        <p class="empty-desc">Cole qualquer link de live na barra de cima, ou aperte <kbd>Ctrl</kbd> + <kbd>V</kbd> em qualquer lugar da página com um link copiado.</p>
        <div class="quick-starters">
          <button class="starter-card tw" onclick="app.openAddModal('tw')"><span class="platform-badge tw">TW</span>Twitch</button>
          <button class="starter-card yt" onclick="app.openAddModal('yt')"><span class="platform-badge yt">YT</span>YouTube</button>
          <button class="starter-card kick" onclick="app.openAddModal('kick')"><span class="platform-badge kick">KI</span>Kick</button>
          <button class="starter-card tiktok" onclick="app.openAddModal('tiktok')"><span class="platform-badge tiktok">TI</span>TikTok</button>
        </div>
        <div class="empty-shortcuts">
          <span><kbd>Ctrl</kbd> + <kbd>K</kbd> focar a barra</span>
          <span><kbd>F2</kbd> modo OBS</span>
          <span><kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>6</kbd> layouts</span>
        </div>
      </div>
    `;
  }

  chatHeaderHTML(chat) {
    const zoom = chat.zoom || 100;
    const avatarUrl = this.getAvatarUrl(chat.type, chat.handle || (chat.type === 'yt' ? '' : chat.channel) || '');
    const id = chat.id;

    return `
      <div class="chat-info">
        <div class="chat-avatar-wrapper" title="${this.escapeHTML(chat.name)}">
          ${avatarUrl ? `
            <img src="${this.escapeHTML(avatarUrl)}" class="chat-avatar-img" alt="" loading="lazy" draggable="false"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
          ` : ''}
          <span class="platform-badge ${chat.type}" style="${avatarUrl ? 'display:none;' : ''}">${this.getBadgeLabel(chat.type)}</span>
          <span class="chat-avatar-dot ${chat.type}"></span>
        </div>
        <span class="chat-title" title="Duplo clique para renomear" ondblclick="app.renameChat('${id}')">${this.escapeHTML(chat.name)}</span>
        <span class="platform-pill ${chat.type}">${this.getPlatformLabel(chat.type)}</span>
        ${chat.isPinned ? '<span class="pin-flag" title="Fixado">📌</span>' : ''}
      </div>

      <div class="chat-controls">
        ${chat.type === 'yt' ? `
          <button class="control-btn" title="Trocar a live do YouTube" onclick="app.updateYouTubeChatLive('${id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        ` : ''}

        ${this.getLoginUrl(chat.type) ? `
          <button class="control-btn login-btn" title="Entrar na conta ${this.getPlatformLabel(chat.type)} para mandar mensagens" onclick="app.loginChat('${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
          </button>
        ` : ''}

        <div class="zoom-group">
          <button class="control-btn" title="Diminuir zoom" onclick="app.adjustZoom('${id}', -10)">−</button>
          <button class="zoom-badge" title="Voltar para 100%" onclick="app.adjustZoom('${id}', 0)">${zoom}%</button>
          <button class="control-btn" title="Aumentar zoom" onclick="app.adjustZoom('${id}', 10)">+</button>
        </div>

        <button class="control-btn" title="Recarregar" onclick="app.reloadChat('${id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>

        <button class="control-btn" title="Abrir em janela popout" onclick="app.openPopout('${id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </button>

        <button class="control-btn ${chat.isPinned ? 'is-on' : ''}" title="${chat.isPinned ? 'Desafixar' : 'Fixar no início'}" onclick="app.togglePinChat('${id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${chat.isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-2l-3-3V5a2 2 0 0 0-4 0v7l-3 3v2z"></path></svg>
        </button>

        <button class="control-btn hide-narrow" title="Mover para a esquerda" onclick="app.moveChat('${id}', -1)">←</button>
        <button class="control-btn hide-narrow" title="Mover para a direita" onclick="app.moveChat('${id}', 1)">→</button>

        <button class="control-btn" title="${chat.isMinimized ? 'Expandir' : 'Minimizar'}" onclick="app.toggleMinimizeChat('${id}')">
          ${chat.isMinimized ? '▼' : '▲'}
        </button>

        <button class="control-btn close-btn" title="Fechar chat" onclick="app.removeChat('${id}')">✕</button>
      </div>
    `;
  }

  createChatBox(chat) {
    const box = document.createElement('div');
    box.id = `box-${chat.id}`;
    box.dataset.id = chat.id;
    box.dataset.platform = chat.type;

    const zoom = chat.zoom || 100;
    const scale = zoom / 100;
    const containerStyle = `transform: scale(${scale}); width: ${100 / scale}%; height: ${100 / scale}%;`;
    const blockedOnFile = (chat.type === 'yt' || chat.type === 'tiktok') && window.location.protocol === 'file:';

    box.innerHTML = `
      <div class="chat-header" draggable="true" title="Arraste para reorganizar"></div>
      <div class="chat-body">
        <div class="chat-loader" id="loader-${chat.id}">
          <div class="spinner"></div>
          <span>Conectando ao chat de ${this.escapeHTML(chat.name)}...</span>
        </div>
        <div class="iframe-container" style="${containerStyle}">
          <iframe
            src="${this.escapeHTML(chat.url)}"
            data-src="${this.escapeHTML(chat.url)}"
            title="Chat ${this.escapeHTML(chat.name)}"
            allowfullscreen
            onload="var l=document.getElementById('loader-${chat.id}'); if(l) l.style.display='none'"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          ></iframe>
        </div>
      </div>
      ${blockedOnFile ? `
        <div class="chat-file-notice">
          <span>⚠️ Bloqueado pelo navegador em <code>file://</code></span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-xs" onclick="app.openPopout('${chat.id}')">↗ Abrir Popout</button>
            <button class="btn btn-xs" onclick="app.openServerGuideModal()">⚡ Iniciar.bat</button>
          </div>
        </div>
      ` : ''}
    `;

    this.updateChatBox(box, chat);
    box.classList.add('is-new');
    setTimeout(() => box.classList.remove('is-new'), 500);
    return box;
  }

  updateChatBox(box, chat) {
    box.className = `chat-box ${chat.isPinned ? 'pinned' : ''} ${chat.isMinimized ? 'minimized' : ''}`;
    box.dataset.platform = chat.type;

    const header = box.querySelector('.chat-header');
    // Não sobrescreve o cabeçalho enquanto o título está sendo editado
    if (header && !header.querySelector('.chat-title[contenteditable="true"]')) {
      header.innerHTML = this.chatHeaderHTML(chat);
    }

    const iframe = box.querySelector('iframe');
    if (iframe && iframe.dataset.src !== chat.url) {
      const loader = box.querySelector('.chat-loader');
      if (loader) loader.style.display = 'flex';
      iframe.dataset.src = chat.url;
      iframe.src = chat.url;
    }

    const container = box.querySelector('.iframe-container');
    if (container) this.applyZoomStyles(container, chat.zoom || 100);
  }

  renderChats() {
    const grid = document.getElementById('grid');
    const countDisplay = document.getElementById('chat-count');
    if (!grid) return;

    if (countDisplay) {
      countDisplay.innerText = `${this.chats.length} chat${this.chats.length === 1 ? '' : 's'}`;
    }
    document.title = this.chats.length > 0 ? `(${this.chats.length}) MultiChat Live Pro` : 'MultiChat Live Pro';

    if (this.chats.length === 0) {
      grid.innerHTML = this.renderEmptyState();
      return;
    }

    const emptyState = grid.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    const existing = new Map();
    grid.querySelectorAll(':scope > .chat-box').forEach(box => existing.set(box.dataset.id, box));

    const ordered = this.getDisplayOrder();
    ordered.forEach((chat, index) => {
      let box = existing.get(chat.id);
      if (box) {
        this.updateChatBox(box, chat);
        existing.delete(chat.id);
      } else {
        box = this.createChatBox(chat);
        grid.appendChild(box);
      }
      box.style.order = index;
      box.classList.toggle('is-focus', index === 0);
    });

    existing.forEach(box => box.remove());
    grid.style.setProperty('--focus-span', Math.max(1, ordered.length - 1));
  }

  // ==========================================
  // Drag & Drop (reorganizar chats arrastando pelo cabeçalho)
  // ==========================================
  bindDragAndDrop() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    let draggedId = null;

    grid.addEventListener('dragstart', (e) => {
      const header = e.target.closest && e.target.closest('.chat-header');
      if (!header) return;
      const box = header.closest('.chat-box');
      draggedId = box.dataset.id;
      box.classList.add('dragging');
      document.body.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedId);
    });

    grid.addEventListener('dragover', (e) => {
      if (!draggedId) return;
      const box = e.target.closest && e.target.closest('.chat-box');
      if (!box || box.dataset.id === draggedId) return;
      e.preventDefault();
      grid.querySelectorAll('.drag-over').forEach(b => b !== box && b.classList.remove('drag-over'));
      box.classList.add('drag-over');
    });

    grid.addEventListener('drop', (e) => {
      if (!draggedId) return;
      const box = e.target.closest && e.target.closest('.chat-box');
      e.preventDefault();
      if (box && box.dataset.id !== draggedId) {
        this.reorderChat(draggedId, box.dataset.id);
      }
    });

    grid.addEventListener('dragend', () => {
      draggedId = null;
      document.body.classList.remove('is-dragging');
      grid.querySelectorAll('.dragging, .drag-over').forEach(b => b.classList.remove('dragging', 'drag-over'));
    });
  }

  reorderChat(fromId, toId) {
    const ordered = this.getDisplayOrder();
    const from = ordered.findIndex(c => c.id === fromId);
    const to = ordered.findIndex(c => c.id === toId);
    if (from === -1 || to === -1) return;

    const [item] = ordered.splice(from, 1);
    const target = ordered.find(c => c.id === toId);
    const insertAt = ordered.indexOf(target) + (from < to ? 1 : 0);
    // Soltar no grupo dos fixados fixa o chat (e vice-versa), para a ordem visual bater com o que foi arrastado
    item.isPinned = target.isPinned;
    ordered.splice(insertAt, 0, item);

    this.chats = ordered;
    this.saveChats();
    this.renderChats();
  }

  // ==========================================
  // Modal Controllers
  // ==========================================
  openAddModal(defaultType = 'auto') {
    const modal = document.getElementById('modal-add-chat');
    const select = document.getElementById('modal-add-type');
    if (select) select.value = defaultType;
    this.updateModalInputPlaceholder(defaultType);
    if (modal) modal.classList.add('active');
    setTimeout(() => {
      const input = document.getElementById('modal-add-input');
      if (input) input.focus();
    }, 100);
  }

  openSettingsModal() {
    const modal = document.getElementById('modal-settings');
    const parentInput = document.getElementById('setting-twitch-parent');
    if (parentInput) parentInput.value = this.getTwitchParent();
    if (modal) modal.classList.add('active');
  }

  openPresetModal() {
    this.renderPresetList();
    const modal = document.getElementById('modal-presets');
    if (modal) modal.classList.add('active');
  }

  openScratchpadModal() {
    const modal = document.getElementById('modal-scratchpad');
    if (modal) modal.classList.add('active');
  }

  openAboutModal() {
    const modal = document.getElementById('modal-about');
    if (modal) modal.classList.add('active');
  }

  openChannelsMemoryModal() {
    this.renderChannelsMemoryModal();
    const modal = document.getElementById('modal-channels-memory');
    if (modal) modal.classList.add('active');
  }

  renderChannelsMemoryModal() {
    const container = document.getElementById('memory-channels-list');
    if (!container) return;

    if (this.savedChannels.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-dim);">Nenhum canal na memória. Adicione um canal acima para salvar suas lives!</div>`;
      return;
    }

    const sorted = [...this.savedChannels].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));

    container.innerHTML = sorted.map(ch => {
      const badgeLabel = this.getBadgeLabel(ch.platform);
      const avatarUrl = this.getAvatarUrl(ch.platform, ch.channelHandle || (ch.platform === 'yt' ? '' : ch.identifier));

      return `
        <div class="preset-item">
          <div style="display:flex; align-items:center; gap:10px;">
            <button class="control-btn" style="color: ${ch.isFavorite ? '#eab308' : 'var(--text-dim)'}; font-size:16px;" onclick="app.toggleFavoriteChannel('${ch.id}')" title="Favoritar">
              ★
            </button>
            ${avatarUrl ? `
              <img src="${avatarUrl}" class="channel-chip-avatar" style="width:24px; height:24px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
            ` : ''}
            <span class="platform-badge ${ch.platform}" style="${avatarUrl ? 'display:none;' : ''}">${badgeLabel}</span>
            <div class="preset-info">
              <span class="preset-name">${this.escapeHTML(ch.name)}</span>
              <span class="preset-count">${ch.channelHandle ? '@' + ch.channelHandle : (ch.identifier ? ch.identifier.substring(0, 15) : 'Canal')}</span>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="app.connectSavedChannel('${ch.id}')">Conectar</button>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="app.removeChannelFromMemory('${ch.id}')">✕</button>
          </div>
        </div>
      `;
    }).join('');
  }

  saveNewChannelFromModal() {
    const platform = document.getElementById('mem-new-platform').value;
    const name = document.getElementById('mem-new-name').value.trim();
    const input = document.getElementById('mem-new-input').value.trim();

    if (!input) {
      this.showToast('Preencha o canal ou link.', 'error');
      return;
    }

    let identifier = input;
    let handle = input;

    if (platform === 'yt') {
      const id = this.extractYouTubeId(input);
      if (id) {
        identifier = id;
      } else {
        handle = this.extractYouTubeHandle(input) || input;
        identifier = '';
      }
    }

    this.rememberChannel({
      platform,
      name: name || handle || identifier,
      identifier,
      channelHandle: handle,
      isFavorite: true
    });

    document.getElementById('mem-new-name').value = '';
    document.getElementById('mem-new-input').value = '';
    this.renderChannelsMemoryModal();
    this.showToast('Canal adicionado à memória com sucesso!', 'success');
  }

  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach((tab, i) => tab.classList.toggle('active', i === 0));
  }

  isModalOpen() {
    return Boolean(document.querySelector('.modal-overlay.active'));
  }

  updateQuickDetect() {
    const input = document.getElementById('quick-input');
    const type = document.getElementById('quick-type');
    const pill = document.getElementById('quick-detect');
    if (!input || !type || !pill) return;

    const value = input.value.trim();
    if (!value || type.value !== 'auto') {
      pill.className = 'detect-pill';
      pill.textContent = '';
      return;
    }
    const platform = this.detectPlatform(value, 'auto');
    const looksLikeLink = /[./]/.test(value);
    pill.className = `detect-pill visible ${platform}`;
    pill.textContent = looksLikeLink ? this.getPlatformLabel(platform) : `${this.getPlatformLabel(platform)}?`;
    pill.title = looksLikeLink ? 'Plataforma detectada pelo link' : 'Sem link: será tratado como canal da Twitch. Troque no seletor ao lado se for outra plataforma.';
  }

  updateModalInputPlaceholder(type) {
    const input = document.getElementById('modal-add-input');
    const label = document.getElementById('modal-add-label');
    const tip = document.getElementById('yt-helper-tip');
    if (!input || !label) return;

    if (tip) {
      tip.style.display = (type === 'yt' || type === 'auto') ? 'flex' : 'none';
    }

    switch (type) {
      case 'auto':
        label.innerText = 'Cole qualquer link de live ou canal:';
        input.placeholder = 'Ex: Cole link do YouTube, Twitch, Kick, TikTok ou qualquer stream...';
        break;
      case 'yt':
        label.innerText = 'Link da Live do YouTube ou Canal:';
        input.placeholder = 'Ex: Cole o link do seu navegador (https://youtube.com/watch?v=...) ou @canal';
        break;
      case 'tw':
        label.innerText = 'Canal da Twitch:';
        input.placeholder = 'Ex: seu_canal ou https://twitch.tv/seu_canal';
        break;
      case 'kick':
        label.innerText = 'Canal Kick:';
        input.placeholder = 'Ex: canal ou kick.com/canal';
        break;
      case 'tiktok':
        label.innerText = 'Usuário TikTok Live:';
        input.placeholder = 'Ex: @usuario ou tiktok.com/@usuario/live';
        break;
      case 'trovo':
        label.innerText = 'Canal Trovo:';
        input.placeholder = 'Ex: canal';
        break;
      case 'owncast':
        label.innerText = 'Endereço do servidor Owncast:';
        input.placeholder = 'Ex: https://live.seuservidor.com';
        break;
      case 'custom':
        label.innerText = 'URL Direta de Chat / Streamlabs / Botrix:';
        input.placeholder = 'https://...';
        break;
    }
  }

  saveSettingsFromModal() {
    const parentInput = document.getElementById('setting-twitch-parent');
    if (parentInput && parentInput.value.trim().length > 0) {
      this.settings.twitchParent = parentInput.value.trim();
      this.saveJSON(this.STORAGE_KEYS.SETTINGS, this.settings);
      
      this.chats.forEach(chat => {
        if (chat.type === 'tw') {
          chat.url = this.buildTwitchUrl(chat.channel);
        }
      });
      this.saveChats();
      this.renderChats();
      this.showToast('Configurações salvas e chats atualizados!', 'success');
    }
    this.closeAllModals();
  }

  // ==========================================
  // Event Bindings
  // ==========================================
  bindEvents() {
    const quickAddBtn = document.getElementById('quick-add-btn');
    const quickInput = document.getElementById('quick-input');
    const quickType = document.getElementById('quick-type');

    if (quickAddBtn && quickInput && quickType) {
      quickAddBtn.addEventListener('click', () => {
        const success = this.addChat({
          type: quickType.value,
          input: quickInput.value
        });
        if (success) quickInput.value = '';
      });

      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          quickAddBtn.click();
        }
      });

      quickInput.addEventListener('input', () => this.updateQuickDetect());
      quickType.addEventListener('change', () => this.updateQuickDetect());
      quickAddBtn.addEventListener('click', () => setTimeout(() => this.updateQuickDetect(), 0));
    }

    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      });
    });

    // Colar um link de live em qualquer lugar da página adiciona o chat na hora
    document.addEventListener('paste', (e) => {
      const target = e.target;
      if (target && (target.closest('input, textarea, [contenteditable="true"]'))) return;
      if (this.isModalOpen()) return;

      const text = (e.clipboardData || window.clipboardData)?.getData('text')?.trim();
      if (!text || !/(youtube\.com|youtu\.be|twitch\.tv|kick\.com|tiktok\.com|trovo\.live)/i.test(text)) return;

      e.preventDefault();
      this.addChat({ type: 'auto', input: text });
    });

    const modalSubmitBtn = document.getElementById('modal-add-submit');
    if (modalSubmitBtn) {
      modalSubmitBtn.addEventListener('click', () => {
        const type = document.getElementById('modal-add-type').value;
        const input = document.getElementById('modal-add-input').value;
        const title = document.getElementById('modal-add-name').value;

        const success = this.addChat({
          type,
          input,
          customTitle: title
        });

        if (success) {
          document.getElementById('modal-add-input').value = '';
          document.getElementById('modal-add-name').value = '';
          this.closeAllModals();
        }
      });
    }

    const modalAddType = document.getElementById('modal-add-type');
    if (modalAddType) {
      modalAddType.addEventListener('change', (e) => {
        this.updateModalInputPlaceholder(e.target.value);
      });
    }

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeAllModals();
        }
      });
    });

    window.addEventListener('keydown', (e) => {
      const typing = e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');

      if (e.key === 'Escape') {
        this.closeAllModals();
        if (typing) e.target.blur();
      }
      if (e.key === 'F2') {
        e.preventDefault();
        this.toggleOBSMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.closeAllModals();
        const input = document.getElementById('quick-input');
        if (input) { input.focus(); input.select(); }
      }
      if (e.altKey && !typing && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        const layouts = ['auto', '1', '2', '3', '4', 'focus'];
        this.applyLayout(layouts[Number(e.key) - 1]);
      }
    });

    const importInput = document.getElementById('import-file-input');
    if (importInput) {
      importInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.importConfig(e.target.files[0]);
        }
      });
    }

    // Wallpaper file input listener
    const wpFileInput = document.getElementById('wallpaper-file-input');
    if (wpFileInput) {
      wpFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          this.handleWallpaperUpload(e.target.files[0]);
        }
      });
    }
  }

  // ==========================================
  // Helper & Storage Utilities
  // ==========================================
  saveChats() {
    this.saveJSON(this.STORAGE_KEYS.CHATS, this.chats);
  }

  loadJSON(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage error:', e);
    }
  }

  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span style="flex: 1;">${this.escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// Global instance and backward compatibility aliases
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new MultiChatApp();
  window.app = app;

  // Backward compatibility helpers
  window.addYT = function(input) {
    input = input || (document.getElementById('yt') ? document.getElementById('yt').value : null);
    if (!input) input = prompt('Cole o link da live do YouTube ou canal:');
    if (input) app.addChat({ type: 'yt', input });
  };

  window.addTwitch = function(input) {
    input = input || (document.getElementById('twitch') ? document.getElementById('twitch').value : null);
    if (!input) input = prompt('Digite o canal da Twitch:');
    if (input) app.addChat({ type: 'tw', input });
  };
});
