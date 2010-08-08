window.addEventListener("load", function() {
        Charlifter.Lifter.init();
    }, false);

if ("undefined" == typeof(Charlifter)) {
    var Charlifter = {};
};

Charlifter.Lifter = {
    init : function() {
        var contextMenu = document.getElementById("contentAreaContextMenu");
        contextMenu.addEventListener("popupshowing", this.readyContextMenu, false);
        this.getLangs(function(aEvent) {
            this.langs = JSON.parse(aEvent.target.responseText).text.split("\n");
            var langsMenu   = document.getElementById("charlifter-cmenu-languages-item");
            for (lang in this.langs) {
                let ele = langsMenu.appendItem(this.langs[lang], this.langs[lang]);
                ele.setAttribute("oncommand", "Charlifter.Lifter.liftSelection('" + this.langs[lang] + "');");
            }
        });
    },

    genRequest : function(args) {
        var url = "http://home.mschade.me:8042/api/request/";
        var request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
        request.open("POST", url, true);
        request.setRequestHeader("Content-ype", "application/json");
        request._call = "js=" + JSON.stringify(args);
        return request;
    },

    getLangs : function(success) {
        request = this.genRequest({
              call: "charlifter.list-languages"
        });
        request.onload = success;
        request.onerror = function(aEvent) {
            window.alert("Failure in getLangs with call: " + request._call);
        };
        request.send(request._call);
    },

    lift : function(lang, text, success) {
        request = this.genRequest({
              call: "charlifter.lift"
            , lang: lang
            , text: text
        });
        request.onload = success;
        request.onerror = function(aEvent) {
            window.alert("Failure in lift with call: " + request._call);
        };
        request.send(request._call);
    },

    liftSelection : function(lang) {
        var focused = document.commandDispatcher.focusedElement;
        focused.disabled = true;
        this.lift(lang, focused.value, function(aEvent) {
            focused.value       = JSON.parse(aEvent.target.responseText).text;
            focused.disabled    = false;
        });
    },

    readyContextMenu : function(aE) {
        var lift        = document.getElementById("charlifter-cmenu-item-lift");
        var langsItem   = document.getElementById("charlifter-cmenu-languages-item");
        lift.hidden         = !(gContextMenu.onTextInput);
        langsItem.hidden    = !(gContextMenu.onTextInput);
    },
};
