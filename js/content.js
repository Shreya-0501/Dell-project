
var brapi = (typeof chrome != 'undefined') ? chrome : (typeof browser != 'undefined' ? browser : {});

(function() {
  var port = brapi.runtime.connect({name: "ReadAloudContentScript"});
  var peer = new RpcPeer(new ExtensionMessagingPeer(port));
  peer.onInvoke = function(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    var handlers = {
      getCurrentIndex: getCurrentIndex,
      getTexts: getTexts
    }
    if (handlers[method]) return handlers[method].apply(handlers, args);
    else console.error("Unknown method", method);
  }
  $(function() {
    peer.invoke("onReady", getInfo());
  })

  function getInfo() {
    return {
      url: location.href,
      title: document.title,
      lang: getLang(),
      requireJs: getRequireJs()
    }
  }

  function getLang() {
    var lang = document.documentElement.lang || $("html").attr("xml:lang");
    if (lang) lang = lang.split(",",1)[0].replace(/_/g, '-');
    if (lang == "en" || lang == "en-US") lang = null;    //foreign language pages often erronenously declare lang="en"
    return lang;
  }

  function getRequireJs() {
    if (typeof readAloudDoc != "undefined") return null;
    else return ["js/html-doc.js"];
  }

  function getCurrentIndex() {
    if (getSelectedText()) return -100;
    else return readAloudDoc.getCurrentIndex();
  }

  function getTexts(index, quietly) {
    if (index < 0) {
      if (index == -100) return getSelectedText().split(paragraphSplitter);
      else return null;
    }
    else {
      return Promise.resolve(readAloudDoc.getTexts(index, quietly))
        .then(function(texts) {
          if (texts && Array.isArray(texts)) {
            texts = texts.map(removeLinks);
            if (!quietly) console.log(texts.join("\n\n"));
          }
          return texts;
        })
    }
  }

  function getSelectedText() {
    return window.getSelection().toString().trim();
  }

  function removeLinks(text) {
    return text.replace(/https?:\/\/\S+/g, "this URL.");
  }
})()


//helpers --------------------------

var paragraphSplitter = /(?:\s*\r?\n\s*){2,}/;

function getInnerText(elem) {
  var text = elem.innerText;
  return text ? text.trim() : "";
}

function isNotEmpty(text) {
  return text;
}

function fixParagraphs(texts) {
  var out = [];
  var para = "";
  for (var i=0; i<texts.length; i++) {
    if (!texts[i]) {
      if (para) {
        out.push(para);
        para = "";
      }
      continue;
    }
    if (para) {
      if (/-$/.test(para)) para = para.substr(0, para.length-1);
      else para += " ";
    }
    para += texts[i].replace(/-\r?\n/g, "");
    if (texts[i].match(/[.!?:)"'\u2019\u201d]$/)) {
      out.push(para);
      para = "";
    }
  }
  if (para) out.push(para);
  return out;
}

function tryGetTexts(getTexts, millis) {
  return waitMillis(500)
    .then(getTexts)
    .then(function(texts) {
      if (texts && !texts.length && millis-500 > 0) return tryGetTexts(getTexts, millis-500);
      else return texts;
    })
}

function waitMillis(millis) {
  return new Promise(function(fulfill) {
    setTimeout(fulfill, millis);
  })
}

function loadPageScript(url) {
  if (!$("head").length) $("<head>").prependTo("html");
  $.ajax({
    dataType: "script",
    cache: true,
    url: url
  });
}

function simulateMouseEvent(element, eventName, coordX, coordY) {
  element.dispatchEvent(new MouseEvent(eventName, {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: coordX,
    clientY: coordY,
    button: 0
  }));
}

function simulateClick(elementToClick) {
  var box = elementToClick.getBoundingClientRect(),
      coordX = box.left + (box.right - box.left) / 2,
      coordY = box.top + (box.bottom - box.top) / 2;
  simulateMouseEvent (elementToClick, "mousedown", coordX, coordY);
  simulateMouseEvent (elementToClick, "mouseup", coordX, coordY);
  simulateMouseEvent (elementToClick, "click", coordX, coordY);
}

function getSettings(names) {
  return new Promise(function(fulfill) {
    brapi.storage.local.get(names, fulfill);
  });
}

function updateSettings(items) {
  return new Promise(function(fulfill) {
    brapi.storage.local.set(items, fulfill);
  });
}

/**
 * Repeat an action
 * @param {Object} opt - options
 * @param {Function} opt.action - action to repeat
 * @param {Function} opt.until - termination condition
 * @param {Number} opt.delay - delay between actions
 * @param {Number} opt.max - maximum number of repetitions
 * @returns {Promise}
 */
function repeat(opt) {
  if (!opt || !opt.action) throw new Error("Missing action")
  return iter(1)
  function iter(n) {
    return Promise.resolve()
      .then(opt.action)
      .then(function(result) {
        if (opt.until && opt.until(result)) return result
        if (opt.max && n >= opt.max) return result
        if (!opt.delay) return iter(n+1)
        return new Promise(function(f) {setTimeout(f, opt.delay)}).then(iter.bind(null, n+1))
      })
  }
}
