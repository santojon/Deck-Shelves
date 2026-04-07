(function(){
  try {
    var win = SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow || window;
    var doc = win.document || document;
    function getTabs(){
      var tabEls = doc.querySelectorAll('[data-tab-id^="unifideck-"]');
      var tabs = [];
      for (var i=0;i<tabEls.length;i++){
        var el = tabEls[i];
        var id = el.getAttribute('data-tab-id')||'';
        var name = (el.innerText||'').trim() || el.getAttribute('aria-label') || id;
        tabs.push({id,name, snippet: (el.outerHTML||'').slice(0,240)});
      }
      return tabs;
    }

    function snapAppsFromDOMForTab(tabId){
      try {
        var selector = '[data-tab-id="'+tabId+'"], [data-tab-id^="'+tabId+'"]';
        var tabEl = doc.querySelector(selector);
        var apps = [];
        if(tabEl){
          var panel = tabEl.closest('.Panel') || tabEl;
          var candidates = panel ? panel.querySelectorAll('[data-appid]') : doc.querySelectorAll('[data-appid]');
          candidates = Array.from(candidates).slice(0,1000);
          for (var j=0;j<candidates.length;j++){
            var a = candidates[j];
            var aid = a.getAttribute('data-appid') || (a.dataset && a.dataset.appid) || null;
            if(aid) apps.push(Number(aid));
          }
        }
        return Array.from(new Set(apps)).filter(Boolean);
      } catch (e) { return []; }
    }

    function tryStoreMethods(tabId){
      var out = [];
      var names = ['UnifiDeckStore','UnifyDeckStore','UnifideckStore','UnifiDeck','Unifideck','UnifyDeck'];
      var methodNames = ['GetAppsForTab','GetTabApps','GetApps','GetAppsForCollection','GetAppsByTab','GetAppIDsForTab','GetAppsForCategory'];
      for(var n=0;n<names.length;n++){
        var obj = (win && win[names[n]]) || (window && window[names[n]]);
        if(!obj) continue;
        for (var m=0;m<methodNames.length;m++){
          try{
            var fn = obj[methodNames[m]];
            if(typeof fn === 'function'){
              var res = fn.call(obj, tabId);
              if(Array.isArray(res)) out.push({source:names[n]+'.'+methodNames[m], value:res});
              else if(res && typeof res === 'object' && Array.isArray(res.apps)) out.push({source:names[n]+'.'+methodNames[m], value:res.apps});
            }
          }catch(e){}
        }
      }
      return out;
    }

    function tryLibraryAPIs(tabId){
      var methods = ['GetAppsForTab','GetTabApps','GetVisibleAppsForTab','ResolveTabApps','GetAppsByTab','GetAppIDsForTab'];
      var outs = [];
      var hostWindows = [ win || window ];
      for(var hw=0; hw<hostWindows.length; hw++){
        var h = hostWindows[hw];
        if(!h) continue;
        for(var key in h){
          try{
            var candidate = h[key];
            if(!candidate) continue;
            for(var mi=0; mi<methods.length; mi++){
               var name = methods[mi];
               var fn = candidate[name];
               if(typeof fn === 'function'){
                 try{
                   var r = fn.call(candidate, tabId);
                   outs.push({source:key+'.'+name, value: r});
                 }catch(e){}
               }
            }
          }catch(e){}
        }
      }
      return outs;
    }

    var tabs = getTabs();
    var results = {tabs: tabs.map(function(t){ return {id:t.id, name:t.name, snippet:t.snippet}; }), details: {}};
    for(var i=0;i<tabs.length;i++){
      var id = tabs[i].id;
      results.details[id]={ domApps: snapAppsFromDOMForTab(id), storeResults: tryStoreMethods(id), libraryAPIs: tryLibraryAPIs(id) };
    }
    return JSON.stringify(results);
  } catch (e) { return JSON.stringify({error:String(e), stack: e && e.stack}); }
})()
