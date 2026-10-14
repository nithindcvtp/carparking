/*
 * config.js  -  shared network settings for index.html, call.html and video.html
 *
 * If you are behind a strict firewall, create a FREE account at https://www.metered.ca
 * (TURN server section) and fill in ONE of the two options below.
 * This is the only file you need to edit. Upload it next to the other pages.
 */
window.CALL_CONFIG = {

  // OPTION A (recommended): Metered app name + API key.
  // Metered dashboard -> your app -> "TURN Server" -> API key.
  // App name is the part before ".metered.live" in your app's address.
  meteredApp: '',      // e.g. 'myapp'
  meteredApiKey: '',   // e.g. 'abcd1234...'

  // OPTION B: a fixed username and password created in the Metered dashboard
  // (Credentials -> Add Credential).
  turnUsername: '',
  turnPassword: ''
};

window.getIceConfig = async function () {
  const cfg = window.CALL_CONFIG || {};

  // Public servers used as fallback (can be slow, limited, or blocked by firewalls).
  const publicServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
    { urls: 'turn:us-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  let own = [];

  // Option A: ask Metered for fresh credentials
  if (cfg.meteredApp && cfg.meteredApiKey) {
    try {
      const r = await fetch('https://' + cfg.meteredApp + '.metered.live/api/v1/turn/credentials?apiKey=' + encodeURIComponent(cfg.meteredApiKey));
      if (r.ok) own = await r.json();
      else console.warn('Metered credentials request failed:', r.status);
    } catch (e) { console.warn('Could not reach Metered:', e); }
  }

  // Option B: fixed username/password
  if (!own.length && cfg.turnUsername) {
    own = [
      { urls: 'turn:relay.metered.ca:80', username: cfg.turnUsername, credential: cfg.turnPassword },
      { urls: 'turn:relay.metered.ca:443', username: cfg.turnUsername, credential: cfg.turnPassword },
      { urls: 'turn:relay.metered.ca:443?transport=tcp', username: cfg.turnUsername, credential: cfg.turnPassword },
      { urls: 'turns:relay.metered.ca:443?transport=tcp', username: cfg.turnUsername, credential: cfg.turnPassword }
    ];
  }

  return { iceServers: own.concat(publicServers) };
};
