
var browserTtsEngine = brapi.tts ? new BrowserTtsEngine() : (typeof speechSynthesis != 'undefined' ? new WebSpeechEngine() : new DummyTtsEngine());
var googleTranslateTtsEngine = new GoogleTranslateTtsEngine();
var googleWavenetTtsEngine = new GoogleWavenetTtsEngine();


/*
interface Options {
  voice: {
    voiceName: string
    autoSelect?: boolean
  }
  lang: string
  rate?: number
  pitch?: number
  volume?: number
}

interface Event {
  type: string
}

interface Voice {
  voiceName: string
  lang: string
}

interface TtsEngine {
  speak: function(text: string, opts: Options, onEvent: (e:Event) => void): void
  stop: function(): void
  pause: function(): void
  resume: function(): void
  isSpeaking: function(callback): void
  getVoices: function(): Voice[]
}
*/

function BrowserTtsEngine() {
  this.speak = function(text, options, onEvent) {
    brapi.tts.speak(text, {
      voiceName: options.voice.voiceName,
      lang: options.lang,
      rate: options.rate,
      pitch: options.pitch,
      volume: options.volume,
      requiredEventTypes: ["start", "end"],
      desiredEventTypes: ["start", "end", "error"],
      onEvent: onEvent
    })
  }
  this.stop = brapi.tts.stop;
  this.pause = brapi.tts.pause;
  this.resume = brapi.tts.resume;
  this.isSpeaking = brapi.tts.isSpeaking;
  this.getVoices = function() {
    return new Promise(function(fulfill) {
      brapi.tts.getVoices(function(voices) {
        fulfill(voices || []);
      })
    })
  }
}


function WebSpeechEngine() {
  var utter;
  this.speak = function(text, options, onEvent) {
    utter = new SpeechSynthesisUtterance();
    utter.text = text;
    utter.voice = options.voice;
    if (options.lang) utter.lang = options.lang;
    if (options.pitch) utter.pitch = options.pitch;
    if (options.rate) utter.rate = options.rate;
    if (options.volume) utter.volume = options.volume;
    utter.onstart = onEvent.bind(null, {type: 'start', charIndex: 0});
    utter.onend = onEvent.bind(null, {type: 'end', charIndex: text.length});
    utter.onerror = function(event) {
      onEvent({type: 'error', errorMessage: event.error});
    };
    speechSynthesis.speak(utter);
  }
  this.stop = function() {
    if (utter) utter.onend = null;
    speechSynthesis.cancel();
  }
  this.pause = function() {
    speechSynthesis.pause();
  }
  this.resume = function() {
    speechSynthesis.resume();
  }
  this.isSpeaking = function(callback) {
    callback(speechSynthesis.speaking);
  }
  this.getVoices = function() {
    return promiseTimeout(1500, "Timeout WebSpeech getVoices", new Promise(function(fulfill) {
      var voices = speechSynthesis.getVoices() || [];
      if (voices.length) fulfill(voices);
      else speechSynthesis.onvoiceschanged = function() {
        fulfill(speechSynthesis.getVoices() || []);
      }
    }))
    .then(function(voices) {
      for (var i=0; i<voices.length; i++) voices[i].voiceName = voices[i].name;
      return voices;
    })
    .catch(function(err) {
      console.error(err);
      return [];
    })
  }
}


function DummyTtsEngine() {
  this.getVoices = function() {
    return Promise.resolve([]);
  }
}


function TimeoutTtsEngine(baseEngine, timeoutMillis) {
  var timer;
  this.speak = function(text, options, onEvent) {
    clearTimeout(timer);
    timer = setTimeout(function() {
      baseEngine.stop();
      onEvent({type: "end", charIndex: text.length});
    },
    timeoutMillis);
    baseEngine.speak(text, options, function(event) {
        if (event.type == "end" || event.type == "error") clearTimeout(timer);
        onEvent(event);
    })
  }
  this.stop = function() {
    clearTimeout(timer);
    baseEngine.stop();
  }
  this.isSpeaking = baseEngine.isSpeaking;
}




function GoogleTranslateTtsEngine() {
  var audio = document.createElement("AUDIO");
  var prefetchAudio;
  var isSpeaking = false;
  var speakPromise;
  this.ready = function() {
    return googleTranslateReady();
  };
  this.speak = function(utterance, options, onEvent) {
    if (!options.volume) options.volume = 1;
    if (!options.rate) options.rate = 1;
    audio.pause();
    audio.volume = options.volume;
    audio.defaultPlaybackRate = options.rate * 1.1;
    audio.onplay = function() {
      onEvent({type: 'start', charIndex: 0});
      isSpeaking = true;
    };
    audio.onended = function() {
      onEvent({type: 'end', charIndex: utterance.length});
      isSpeaking = false;
    };
    audio.onerror = function() {
      onEvent({type: "error", errorMessage: audio.error.message});
      isSpeaking = false;
    };
    speakPromise = Promise.resolve()
      .then(function() {
        if (prefetchAudio && prefetchAudio[0] == utterance && prefetchAudio[1] == options) return prefetchAudio[2];
        else return getAudioUrl(utterance, options.voice.lang);
      })
      .then(function(url) {
        audio.src = url;
        return audio.play();
      })
      .catch(function(err) {
        onEvent({
          type: "error",
          errorMessage: err.name == "NotAllowedError" ? JSON.stringify({code: "error_user_gesture_required"}) : err.message
        })
      })
  };
  this.isSpeaking = function(callback) {
    callback(isSpeaking);
  };
  this.pause =
  this.stop = function() {
    speakPromise.then(function() {audio.pause()});
  };
  this.resume = function() {
    audio.play();
  };
  this.prefetch = function(utterance, options) {
    getAudioUrl(utterance, options.voice.lang)
      .then(function(url) {
        prefetchAudio = [utterance, options, url];
      })
      .catch(console.error)
  };
  this.setNextStartTime = function() {
  };
  this.getVoices = function() {
    return voices;
  }
  function getAudioUrl(text, lang) {
    assert(text && lang);
    return googleTranslateSynthesizeSpeech(text, lang);
  }
  var voices = [
      {"voice_name": "GoogleTranslate Afrikaans", "lang": "af", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Albanian", "lang": "sq", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Arabic", "lang": "ar", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Armenian", "lang": "hy", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Bengali", "lang": "bn", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Bosnian", "lang": "bs", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Bulgarian", "lang": "bg", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Catalan", "lang": "ca", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Chinese", "lang": "zh-CN", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Croatian", "lang": "hr", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Czech", "lang": "cs", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Danish", "lang": "da", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Dutch", "lang": "nl", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate English", "lang": "en", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Esperanto", "lang": "eo", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Estonia", "lang": "et", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Filipino", "lang": "fil", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Finnish", "lang": "fi", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate French", "lang": "fr", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate German", "lang": "de", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Greek", "lang": "el", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Gujarati", "lang": "gu", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Hebrew", "lang": "he", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Hindi", "lang": "hi", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Hungarian", "lang": "hu", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Icelandic", "lang": "is", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Indonesian", "lang": "id", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Italian", "lang": "it", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Japanese", "lang": "ja", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Khmer", "lang": "km", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Korean", "lang": "ko", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Latin", "lang": "la", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Latvian", "lang": "lv", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Macedonian", "lang": "mk", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Malay", "lang": "ms", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Malayalam", "lang": "ml", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Marathi", "lang": "mr", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Myanmar (Burmese)", "lang": "my", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Nepali", "lang": "ne", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Norwegian", "lang": "no", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Polish", "lang": "pl", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Portuguese", "lang": "pt", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Romanian", "lang": "ro", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Russian", "lang": "ru", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Serbian", "lang": "sr", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Sinhala", "lang": "si", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Slovak", "lang": "sk", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Spanish", "lang": "es", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Sundanese", "lang": "su", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Swahili", "lang": "sw", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Swedish", "lang": "sv", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Tagalog", "lang": "tl", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Tamil", "lang": "ta", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Telugu", "lang": "te", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Thai", "lang": "th", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Turkish", "lang": "tr", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Ukrainian", "lang": "uk", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Urdu", "lang": "ur", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Vietnamese", "lang": "vi", "event_types": ["start", "end", "error"]},
      {"voice_name": "GoogleTranslate Welsh", "lang": "cy", "event_types": ["start", "end", "error"]}
    ]
    .map(function(item) {
      return {voiceName: item.voice_name, lang: item.lang};
    })
}



function GoogleWavenetTtsEngine() {
  var audio = document.createElement("AUDIO");
  var prefetchAudio;
  var isSpeaking = false;
  var speakPromise;
  this.speak = function(utterance, options, onEvent) {
    if (!options.volume) options.volume = 1;
    if (!options.rate) options.rate = 1;
    if (!options.pitch) options.pitch = 1;
    audio.pause();
    audio.volume = options.volume;
    audio.defaultPlaybackRate = options.rate;
    audio.onplay = function() {
      onEvent({type: 'start', charIndex: 0});
      isSpeaking = true;
    };
    audio.onended = function() {
      onEvent({type: 'end', charIndex: utterance.length});
      isSpeaking = false;
    };
    audio.onerror = function() {
      onEvent({type: "error", errorMessage: audio.error.message});
      isSpeaking = false;
    };
    speakPromise = Promise.resolve()
      .then(function() {
        if (prefetchAudio && prefetchAudio[0] == utterance && prefetchAudio[1] == options) return prefetchAudio[2];
        else return getAudioUrl(utterance, options.voice, options.pitch);
      })
      .then(function(url) {
        audio.src = url;
        return audio.play();
      })
      .catch(function(err) {
        onEvent({
          type: "error",
          errorMessage: err.name == "NotAllowedError" ? JSON.stringify({code: "error_user_gesture_required"}) : err.message
        })
      })
  };
  this.isSpeaking = function(callback) {
    callback(isSpeaking);
  };
  this.pause =
  this.stop = function() {
    speakPromise.then(function() {audio.pause()});
  };
  this.resume = function() {
    audio.play();
  };
  this.prefetch = function(utterance, options) {
    getAudioUrl(utterance, options.voice, options.pitch)
      .then(function(url) {
        prefetchAudio = [utterance, options, url];
      })
      .catch(console.error)
  };
  this.setNextStartTime = function() {
  };
  this.getVoices = function() {
    return getSettings(["wavenetVoices"])
      .then(function(items) {
        if (!items.wavenetVoices || Date.now()-items.wavenetVoices[0].ts > 24*3600*1000) updateVoices();
        return items.wavenetVoices || voices;
      })
  }
  this.getFreeVoices = function() {
    return this.getVoices()
      .then(function(items) {
        return items.filter(function(item) {
          return item.voiceName.match(/^GoogleStandard /);
        })
      })
  }
  function updateVoices() {
    ajaxGet(config.serviceUrl + "/read-aloud/list-voices/google")
      .then(JSON.parse)
      .then(function(list) {
        list[0].ts = Date.now();
        updateSettings({wavenetVoices: list});
      })
  }
  function getAudioUrl(text, voice, pitch) {
    assert(text && voice && pitch != null);
    var matches = voice.voiceName.match(/^Google(\w+) .* \((\w+)\)$/);
    var voiceName = voice.lang + "-" + matches[1] + "-" + matches[2][0];
    return getSettings(["gcpCreds", "gcpToken"])
      .then(function(settings) {
        var postData = {
          input: {
            text: text
          },
          voice: {
            languageCode: voice.lang,
            name: voiceName
          },
          audioConfig: {
            audioEncoding: "mp3",
            pitch: (pitch-1)*20
          }
        }
        if (settings.gcpCreds) return ajaxPost("https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=" + settings.gcpCreds.apiKey, postData, "json");
        if (!settings.gcpToken) throw new Error(JSON.stringify({code: "error_wavenet_auth_required"}));
        return ajaxPost("https://cxl-services.appspot.com/proxy?url=https://texttospeech.googleapis.com/v1beta1/text:synthesize&token=" + settings.gcpToken, postData, "json")
          .catch(function(err) {
            console.error(err);
            throw new Error(JSON.stringify({code: "error_wavenet_auth_required"}));
          })
      })
      .then(function(responseText) {
        var data = JSON.parse(responseText);
        return "data:audio/mpeg;base64," + data.audioContent;
      })
  }
  var voices = [
    {"voiceName":"GoogleWavenet Arabic (Anna)","lang":"ar-XA","gender":"female"},
    {"voiceName":"GoogleWavenet Arabic (Benjamin)","lang":"ar-XA","gender":"male"},
    {"voiceName":"GoogleWavenet Arabic (Christopher)","lang":"ar-XA","gender":"male"},
    {"voiceName":"GoogleWavenet Mandarin (Anna)","lang":"cmn-CN","gender":"female"},
    {"voiceName":"GoogleWavenet Mandarin (Benjamin)","lang":"cmn-CN","gender":"male"},
    {"voiceName":"GoogleWavenet Mandarin (Christopher)","lang":"cmn-CN","gender":"male"},
    {"voiceName":"GoogleWavenet Mandarin (Diane)","lang":"cmn-CN","gender":"female"},
    {"voiceName":"GoogleWavenet Czech (Anna)","lang":"cs-CZ","gender":"female"},
    {"voiceName":"GoogleWavenet Danish (Anna)","lang":"da-DK","gender":"female"},
    {"voiceName":"GoogleWavenet German (Anna)","lang":"de-DE","gender":"female"},
    {"voiceName":"GoogleWavenet German (Benjamin)","lang":"de-DE","gender":"male"},
    {"voiceName":"GoogleWavenet German (Caroline)","lang":"de-DE","gender":"female"},
    {"voiceName":"GoogleWavenet German (Daniel)","lang":"de-DE","gender":"male"},
    {"voiceName":"GoogleWavenet German (Ethan)","lang":"de-DE","gender":"male"},
    {"voiceName":"GoogleWavenet Greek, Modern (Anna)","lang":"el-GR","gender":"female"},
    {"voiceName":"GoogleWavenet Australian English (Anna)","lang":"en-AU","gender":"female"},
    {"voiceName":"GoogleWavenet Australian English (Benjamin)","lang":"en-AU","gender":"male"},
    {"voiceName":"GoogleWavenet Australian English (Caroline)","lang":"en-AU","gender":"female"},
    {"voiceName":"GoogleWavenet Australian English (Daniel)","lang":"en-AU","gender":"male"},
    {"voiceName":"GoogleWavenet British English (Anna)","lang":"en-GB","gender":"female"},
    {"voiceName":"GoogleWavenet British English (Benjamin)","lang":"en-GB","gender":"male"},
    {"voiceName":"GoogleWavenet British English (Caroline)","lang":"en-GB","gender":"female"},
    {"voiceName":"GoogleWavenet British English (Daniel)","lang":"en-GB","gender":"male"},
    {"voiceName":"GoogleWavenet Indian English (Anna)","lang":"en-IN","gender":"female"},
    {"voiceName":"GoogleWavenet Indian English (Benjamin)","lang":"en-IN","gender":"male"},
    {"voiceName":"GoogleWavenet Indian English (Christopher)","lang":"en-IN","gender":"male"},
    {"voiceName":"GoogleWavenet US English (Adam)","lang":"en-US","gender":"male"},
    {"voiceName":"GoogleWavenet US English (Benjamin)","lang":"en-US","gender":"male"},
    {"voiceName":"GoogleWavenet US English (Caroline)","lang":"en-US","gender":"female"},
    {"voiceName":"GoogleWavenet US English (Daniel)","lang":"en-US","gender":"male"},
    {"voiceName":"GoogleWavenet US English (Elizabeth)","lang":"en-US","gender":"female"},
    {"voiceName":"GoogleWavenet US English (Francesca)","lang":"en-US","gender":"female"},
    {"voiceName":"GoogleWavenet Finnish (Anna)","lang":"fi-FI","gender":"female"},
    {"voiceName":"GoogleWavenet Filipino (Anna)","lang":"fil-PH","gender":"female"},
    {"voiceName":"GoogleWavenet Canadian French (Anna)","lang":"fr-CA","gender":"female"},
    {"voiceName":"GoogleWavenet Canadian French (Benjamin)","lang":"fr-CA","gender":"male"},
    {"voiceName":"GoogleWavenet Canadian French (Caroline)","lang":"fr-CA","gender":"female"},
    {"voiceName":"GoogleWavenet Canadian French (Daniel)","lang":"fr-CA","gender":"male"},
    {"voiceName":"GoogleWavenet French (Anna)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleWavenet French (Benjamin)","lang":"fr-FR","gender":"male"},
    {"voiceName":"GoogleWavenet French (Caroline)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleWavenet French (Daniel)","lang":"fr-FR","gender":"male"},
    {"voiceName":"GoogleWavenet French (Elizabeth)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleWavenet Hindi (Anna)","lang":"hi-IN","gender":"female"},
    {"voiceName":"GoogleWavenet Hindi (Benjamin)","lang":"hi-IN","gender":"male"},
    {"voiceName":"GoogleWavenet Hindi (Christopher)","lang":"hi-IN","gender":"male"},
    {"voiceName":"GoogleWavenet Hungarian (Anna)","lang":"hu-HU","gender":"female"},
    {"voiceName":"GoogleWavenet Indonesian (Anna)","lang":"id-ID","gender":"female"},
    {"voiceName":"GoogleWavenet Indonesian (Benjamin)","lang":"id-ID","gender":"male"},
    {"voiceName":"GoogleWavenet Indonesian (Christopher)","lang":"id-ID","gender":"male"},
    {"voiceName":"GoogleWavenet Italian (Anna)","lang":"it-IT","gender":"female"},
    {"voiceName":"GoogleWavenet Italian (Bianca)","lang":"it-IT","gender":"female"},
    {"voiceName":"GoogleWavenet Italian (Christopher)","lang":"it-IT","gender":"male"},
    {"voiceName":"GoogleWavenet Italian (Daniel)","lang":"it-IT","gender":"male"},
    {"voiceName":"GoogleWavenet Japanese (Anna)","lang":"ja-JP","gender":"female"},
    {"voiceName":"GoogleWavenet Japanese (Bianca)","lang":"ja-JP","gender":"female"},
    {"voiceName":"GoogleWavenet Japanese (Christopher)","lang":"ja-JP","gender":"male"},
    {"voiceName":"GoogleWavenet Japanese (Daniel)","lang":"ja-JP","gender":"male"},
    {"voiceName":"GoogleWavenet Korean (Bianca)","lang":"ko-KR","gender":"female"},
    {"voiceName":"GoogleWavenet Korean (Christopher)","lang":"ko-KR","gender":"male"},
    {"voiceName":"GoogleWavenet Korean (Daniel)","lang":"ko-KR","gender":"male"},
    {"voiceName":"GoogleWavenet Korean (Anna)","lang":"ko-KR","gender":"female"},
    {"voiceName":"GoogleWavenet Norwegian Bokmål (Elizabeth)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleWavenet Norwegian Bokmål (Anna)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleWavenet Norwegian Bokmål (Benjamin)","lang":"nb-NO","gender":"male"},
    {"voiceName":"GoogleWavenet Norwegian Bokmål (Caroline)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleWavenet Norwegian Bokmål (Daniel)","lang":"nb-NO","gender":"male"},
    {"voiceName":"GoogleWavenet Dutch (Benjamin)","lang":"nl-NL","gender":"male"},
    {"voiceName":"GoogleWavenet Dutch (Christopher)","lang":"nl-NL","gender":"male"},
    {"voiceName":"GoogleWavenet Dutch (Diane)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleWavenet Dutch (Elizabeth)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleWavenet Dutch (Anna)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleWavenet Polish (Anna)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleWavenet Polish (Benjamin)","lang":"pl-PL","gender":"male"},
    {"voiceName":"GoogleWavenet Polish (Christopher)","lang":"pl-PL","gender":"male"},
    {"voiceName":"GoogleWavenet Polish (Diane)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleWavenet Polish (Elizabeth)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleWavenet Brazilian Portuguese (Anna)","lang":"pt-BR","gender":"female"},
    {"voiceName":"GoogleWavenet Portuguese (Anna)","lang":"pt-PT","gender":"female"},
    {"voiceName":"GoogleWavenet Portuguese (Benjamin)","lang":"pt-PT","gender":"male"},
    {"voiceName":"GoogleWavenet Portuguese (Christopher)","lang":"pt-PT","gender":"male"},
    {"voiceName":"GoogleWavenet Portuguese (Diane)","lang":"pt-PT","gender":"female"},
    {"voiceName":"GoogleWavenet Russian (Elizabeth)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleWavenet Russian (Anna)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleWavenet Russian (Benjamin)","lang":"ru-RU","gender":"male"},
    {"voiceName":"GoogleWavenet Russian (Caroline)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleWavenet Russian (Daniel)","lang":"ru-RU","gender":"male"},
    {"voiceName":"GoogleWavenet Slovak (Anna)","lang":"sk-SK","gender":"female"},
    {"voiceName":"GoogleWavenet Swedish (Anna)","lang":"sv-SE","gender":"female"},
    {"voiceName":"GoogleWavenet Turkish (Anna)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleWavenet Turkish (Benjamin)","lang":"tr-TR","gender":"male"},
    {"voiceName":"GoogleWavenet Turkish (Caroline)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleWavenet Turkish (Diane)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleWavenet Turkish (Ethan)","lang":"tr-TR","gender":"male"},
    {"voiceName":"GoogleWavenet Ukrainian (Anna)","lang":"uk-UA","gender":"female"},
    {"voiceName":"GoogleWavenet Vietnamese (Anna)","lang":"vi-VN","gender":"female"},
    {"voiceName":"GoogleWavenet Vietnamese (Benjamin)","lang":"vi-VN","gender":"male"},
    {"voiceName":"GoogleWavenet Vietnamese (Caroline)","lang":"vi-VN","gender":"female"},
    {"voiceName":"GoogleWavenet Vietnamese (Daniel)","lang":"vi-VN","gender":"male"},
    {"voiceName":"GoogleStandard Spanish; Castilian (Anna)","lang":"es-ES","gender":"female"},
    {"voiceName":"GoogleStandard Arabic (Anna)","lang":"ar-XA","gender":"female"},
    {"voiceName":"GoogleStandard Arabic (Benjamin)","lang":"ar-XA","gender":"male"},
    {"voiceName":"GoogleStandard Arabic (Christopher)","lang":"ar-XA","gender":"male"},
    {"voiceName":"GoogleStandard Arabic (Diane)","lang":"ar-XA","gender":"female"},
    {"voiceName":"GoogleStandard French (Elizabeth)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleStandard Italian (Anna)","lang":"it-IT","gender":"female"},
    {"voiceName":"GoogleStandard Russian (Elizabeth)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleStandard Russian (Anna)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleStandard Russian (Benjamin)","lang":"ru-RU","gender":"male"},
    {"voiceName":"GoogleStandard Russian (Caroline)","lang":"ru-RU","gender":"female"},
    {"voiceName":"GoogleStandard Russian (Daniel)","lang":"ru-RU","gender":"male"},
    {"voiceName":"GoogleStandard Mandarin (Diane)","lang":"cmn-CN","gender":"female"},
    {"voiceName":"GoogleStandard Mandarin (Anna)","lang":"cmn-CN","gender":"female"},
    {"voiceName":"GoogleStandard Mandarin (Benjamin)","lang":"cmn-CN","gender":"male"},
    {"voiceName":"GoogleStandard Mandarin (Christopher)","lang":"cmn-CN","gender":"male"},
    {"voiceName":"GoogleStandard Korean (Anna)","lang":"ko-KR","gender":"female"},
    {"voiceName":"GoogleStandard Korean (Bianca)","lang":"ko-KR","gender":"female"},
    {"voiceName":"GoogleStandard Korean (Christopher)","lang":"ko-KR","gender":"male"},
    {"voiceName":"GoogleStandard Korean (Daniel)","lang":"ko-KR","gender":"male"},
    {"voiceName":"GoogleStandard Japanese (Anna)","lang":"ja-JP","gender":"female"},
    {"voiceName":"GoogleStandard Japanese (Bianca)","lang":"ja-JP","gender":"female"},
    {"voiceName":"GoogleStandard Japanese (Christopher)","lang":"ja-JP","gender":"male"},
    {"voiceName":"GoogleStandard Japanese (Daniel)","lang":"ja-JP","gender":"male"},
    {"voiceName":"GoogleStandard Vietnamese (Anna)","lang":"vi-VN","gender":"female"},
    {"voiceName":"GoogleStandard Vietnamese (Benjamin)","lang":"vi-VN","gender":"male"},
    {"voiceName":"GoogleStandard Vietnamese (Caroline)","lang":"vi-VN","gender":"female"},
    {"voiceName":"GoogleStandard Vietnamese (Daniel)","lang":"vi-VN","gender":"male"},
    {"voiceName":"GoogleStandard Filipino (Anna)","lang":"fil-PH","gender":"female"},
    {"voiceName":"GoogleStandard Indonesian (Anna)","lang":"id-ID","gender":"female"},
    {"voiceName":"GoogleStandard Indonesian (Benjamin)","lang":"id-ID","gender":"male"},
    {"voiceName":"GoogleStandard Indonesian (Christopher)","lang":"id-ID","gender":"male"},
    {"voiceName":"GoogleStandard Dutch (Anna)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleStandard Dutch (Benjamin)","lang":"nl-NL","gender":"male"},
    {"voiceName":"GoogleStandard Dutch (Christopher)","lang":"nl-NL","gender":"male"},
    {"voiceName":"GoogleStandard Dutch (Diane)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleStandard Dutch (Elizabeth)","lang":"nl-NL","gender":"female"},
    {"voiceName":"GoogleStandard Czech (Anna)","lang":"cs-CZ","gender":"female"},
    {"voiceName":"GoogleStandard Greek, Modern (Anna)","lang":"el-GR","gender":"female"},
    {"voiceName":"GoogleStandard Brazilian Portuguese (Anna)","lang":"pt-BR","gender":"female"},
    {"voiceName":"GoogleStandard Hungarian (Anna)","lang":"hu-HU","gender":"female"},
    {"voiceName":"GoogleStandard Polish (Elizabeth)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleStandard Polish (Anna)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleStandard Polish (Benjamin)","lang":"pl-PL","gender":"male"},
    {"voiceName":"GoogleStandard Polish (Christopher)","lang":"pl-PL","gender":"male"},
    {"voiceName":"GoogleStandard Polish (Diane)","lang":"pl-PL","gender":"female"},
    {"voiceName":"GoogleStandard Slovak (Anna)","lang":"sk-SK","gender":"female"},
    {"voiceName":"GoogleStandard Turkish (Anna)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleStandard Turkish (Benjamin)","lang":"tr-TR","gender":"male"},
    {"voiceName":"GoogleStandard Turkish (Caroline)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleStandard Turkish (Diane)","lang":"tr-TR","gender":"female"},
    {"voiceName":"GoogleStandard Turkish (Ethan)","lang":"tr-TR","gender":"male"},
    {"voiceName":"GoogleStandard Ukrainian (Anna)","lang":"uk-UA","gender":"female"},
    {"voiceName":"GoogleStandard Indian English (Anna)","lang":"en-IN","gender":"female"},
    {"voiceName":"GoogleStandard Indian English (Benjamin)","lang":"en-IN","gender":"male"},
    {"voiceName":"GoogleStandard Indian English (Christopher)","lang":"en-IN","gender":"male"},
    {"voiceName":"GoogleStandard Hindi (Anna)","lang":"hi-IN","gender":"female"},
    {"voiceName":"GoogleStandard Hindi (Benjamin)","lang":"hi-IN","gender":"male"},
    {"voiceName":"GoogleStandard Hindi (Christopher)","lang":"hi-IN","gender":"male"},
    {"voiceName":"GoogleStandard Danish (Anna)","lang":"da-DK","gender":"female"},
    {"voiceName":"GoogleStandard Finnish (Anna)","lang":"fi-FI","gender":"female"},
    {"voiceName":"GoogleStandard Portuguese (Anna)","lang":"pt-PT","gender":"female"},
    {"voiceName":"GoogleStandard Portuguese (Benjamin)","lang":"pt-PT","gender":"male"},
    {"voiceName":"GoogleStandard Portuguese (Christopher)","lang":"pt-PT","gender":"male"},
    {"voiceName":"GoogleStandard Portuguese (Diane)","lang":"pt-PT","gender":"female"},
    {"voiceName":"GoogleStandard Norwegian Bokmål (Elizabeth)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleStandard Norwegian Bokmål (Anna)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleStandard Norwegian Bokmål (Benjamin)","lang":"nb-NO","gender":"male"},
    {"voiceName":"GoogleStandard Norwegian Bokmål (Caroline)","lang":"nb-NO","gender":"female"},
    {"voiceName":"GoogleStandard Norwegian Bokmål (Daniel)","lang":"nb-NO","gender":"male"},
    {"voiceName":"GoogleStandard Swedish (Anna)","lang":"sv-SE","gender":"female"},
    {"voiceName":"GoogleStandard British English (Anna)","lang":"en-GB","gender":"female"},
    {"voiceName":"GoogleStandard British English (Benjamin)","lang":"en-GB","gender":"male"},
    {"voiceName":"GoogleStandard British English (Caroline)","lang":"en-GB","gender":"female"},
    {"voiceName":"GoogleStandard British English (Daniel)","lang":"en-GB","gender":"male"},
    {"voiceName":"GoogleStandard US English (Benjamin)","lang":"en-US","gender":"male"},
    {"voiceName":"GoogleStandard US English (Caroline)","lang":"en-US","gender":"female"},
    {"voiceName":"GoogleStandard US English (Daniel)","lang":"en-US","gender":"male"},
    {"voiceName":"GoogleStandard US English (Elizabeth)","lang":"en-US","gender":"female"},
    {"voiceName":"GoogleStandard German (Anna)","lang":"de-DE","gender":"female"},
    {"voiceName":"GoogleStandard German (Benjamin)","lang":"de-DE","gender":"male"},
    {"voiceName":"GoogleStandard German (Ethan)","lang":"de-DE","gender":"male"},
    {"voiceName":"GoogleStandard Australian English (Anna)","lang":"en-AU","gender":"female"},
    {"voiceName":"GoogleStandard Australian English (Benjamin)","lang":"en-AU","gender":"male"},
    {"voiceName":"GoogleStandard Australian English (Caroline)","lang":"en-AU","gender":"female"},
    {"voiceName":"GoogleStandard Australian English (Daniel)","lang":"en-AU","gender":"male"},
    {"voiceName":"GoogleStandard Canadian French (Anna)","lang":"fr-CA","gender":"female"},
    {"voiceName":"GoogleStandard Canadian French (Benjamin)","lang":"fr-CA","gender":"male"},
    {"voiceName":"GoogleStandard Canadian French (Caroline)","lang":"fr-CA","gender":"female"},
    {"voiceName":"GoogleStandard Canadian French (Daniel)","lang":"fr-CA","gender":"male"},
    {"voiceName":"GoogleStandard French (Anna)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleStandard French (Benjamin)","lang":"fr-FR","gender":"male"},
    {"voiceName":"GoogleStandard French (Caroline)","lang":"fr-FR","gender":"female"},
    {"voiceName":"GoogleStandard French (Daniel)","lang":"fr-FR","gender":"male"},
    {"voiceName":"GoogleStandard Italian (Bianca)","lang":"it-IT","gender":"female"},
    {"voiceName":"GoogleStandard Italian (Christopher)","lang":"it-IT","gender":"male"},
    {"voiceName":"GoogleStandard Italian (Daniel)","lang":"it-IT","gender":"male"}
  ]
}


