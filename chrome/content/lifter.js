if ("undefined" == typeof(Charlifter)) {
    var Charlifter = {};
};

Charlifter.SQL = function() {
    let db = null;
    let connect = function() {
        /* Connects to sqlite file if not already done so */
        if (db == null) {
            let file = Components.classes["@mozilla.org/file/directory_service;1"]
                         .getService(Components.interfaces.nsIProperties)
                         .get("ProfD", Components.interfaces.nsIFile);
            file.append("charlifter.sqlite");
            let storageService = Components.classes["@mozilla.org/storage/service;1"]
                                    .getService(Components.interfaces.mozIStorageService);
            db = storageService.openDatabase(file); // Make database file if not found
            // Initialize lang table if not in existence
            let statement = query(
                "CREATE TABLE IF NOT EXISTS langs (code VARCHAR(5), localization VARCHAR(255))"
            );
            statement.executeAsync();
        }
    };
    let query = function(query) {
        /* Connects to db if necessary and creates query statement */
        if (db == null) connect();
        return db.createStatement(query);
    };
    return {
        clearLangs : function(callbacks) {
            /* Clears languages from database. */
            let statement = query("DELETE FROM langs");
            statement.executeAsync(callbacks);
        },
        newLangs : function(langs, callbacks) {
            /* Takes languages as [[ISO-639, Localized Name], [ISO 639, Localized Name], ...] */
            let statement = query("INSERT INTO langs (code, localization) VALUES (:code, :localization)");
            let params = statement.newBindingParamsArray();
            for (let lang in langs) {
                let bp = params.newBindingParams();
                bp.bindByName("code",        langs[lang][0]);
                bp.bindByName("localization",langs[lang][1]);
                params.addParams(bp);
            }
            statement.bindParameters(params);
            statement.executeAsync(callbacks);
        },
        getLangs : function(callbacks) {
            /* Return languages. */
            let statement = query("SELECT code, localization FROM langs");
            statement.executeAsync(callbacks);
        },
        getLangLocalization : function(code, callbacks) {
            /* Provides stored language localization when provided ISO 639 code. */
            let statement = query("SELECT localization FROM langs WHERE code == :code LIMIT 1");
            statement.params.code = code;
            statement.executeAsync(callbacks);
        },
    }
}();

Charlifter.Lifter = {
    codes : { // API Response Codes
          liftSuccess       : 200
        , liftFailUnknown   : 400
        , langListOutdated  : 100
        , langListCurrent   : 200
        , langListOvernew   : 400
    },

    init : function() {
        /* Create dynamic menu of available */
        /* TODO: REMOVE THIS PREFERENCE SETTING */
            let prefs = Components.classes["@mozilla.org/preferences-service;1"]
                .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages.");
            prefs.setCharPref("selection-code", "es");
            prefs.setCharPref("selection-localized", "Spanish");
            prefs.setIntPref("version", 1);
            prefs.setCharPref("locale", "en-US");
        /* TODO: REMOVE THIS PREFERENCE SETTING */
        let contextMenu = document.getElementById("contentAreaContextMenu");
        contextMenu.addEventListener("popupshowing", this.readyContextMenu, false);
        this.getLangs(function(aSuccess) {
            let owner = Charlifter.Lifter;
            response = JSON.parse(aSuccess.target.responseText);
            switch(response.code) {
                case owner.codes.langListOutdated:
                    /* New list available. Clear old languages and insert new list to database. */
                    let langs = response.text.split(','); // TODO: [["es", "Espanol"], ["fr", "Francois"]]
                    for (let langPair in langs) {
                        langs[langPair] = [langs[langPair], "Spanish"]; // TODO: Get localized value
                    }
                    Charlifter.SQL.clearLangs({
                        handleError: function(aError) {
                            window.alert("Error with clearing languages.");
                        }
                    });
                    Charlifter.SQL.newLangs(langs, {
                        handleError: function(aError) {
                            window.alert("Error with adding new languages.");
                        },
                    });
                    break;
                case owner.codes.langListCurrent:
                    break;
                case owner.codes.langListOvernew:
                    break;
                default:
                    break;
            }
        }, function(aError) {
            window.alert("Failure with call: " + request._call);
        });
        /* Populate language list menu. */
        let langsMenu = document.getElementById("charlifter-cmenu-languages-item");
        Charlifter.SQL.getLangs({
            handleResult: function(aResultSet) {
                let strbundle = document.getElementById("charlifter-string-bundle");
                for (let row=aResultSet.getNextRow(); row; row=aResultSet.getNextRow()) {
                    let ele = langsMenu.appendItem(
                          strbundle.getFormattedString("lift-csubmenu-item-label", [
                                row.getResultByName("localization")
                              , row.getResultByName("code")
                          ])
                        , row.getResultByName("code")
                    );
                    ele.setAttribute("oncommand",
                        "Charlifter.Lifter.liftSelection('" + row.getResultByName("code") + "');"
                    );
                }
            },
            handleError: function(aError) {
                window.alert("Error with retrieving languages for menu generation.");
            },
        });
    },

    readyContextMenu : function(aE) {
        /* Hide context menu elements where appropriate */
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService).getBranch("charlifter.languages.");
        let strbundle       = document.getElementById("charlifter-string-bundle");
        let liftItem        = document.getElementById("charlifter-cmenu-item-lift");
        liftItem.setAttribute("label", strbundle.getFormattedString(
            "lift-citem-label", [
                  prefs.getCharPref("selection-localized")
                , prefs.getCharPref("selection-code")
            ]
        ));
        liftItem.setAttribute("oncommand",
            "Charlifter.Lifter.liftSelection('" + prefs.getCharPref("selection-code") + "');"
        );
        let langsItem       = document.getElementById("charlifter-cmenu-languages-item");
        liftItem.hidden     = !(gContextMenu.onTextInput);
        langsItem.hidden    = !(gContextMenu.onTextInput);
    },

    genRequest : function(args, success, error) {
        /* Abstracts API calling code */
        let url = "http://ares:1932/";
        let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
        request.open("POST", url, true);
        request.onload  = success;
        request.onerror = error;
        request.setRequestHeader("Content-ype", "application/json");
        request.setRequestHeader("charset", "UTF-8");
        request._call = JSON.stringify(args);
        return request;
    },

    getLangs : function(success, error) {
        /* API Call: Get language list */
        let prefs   = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        let cprefs  = prefs.getBranch("charlifter.languages.");
        let locale  = prefs.getBranch("general.useragent.").getCharPref("locale");
        let version = 0; // If the browser locale has changed, we need a new list
        if (locale == cprefs.getCharPref("locale")) {
            version = cprefs.getIntPref("version");
        }
        request = this.genRequest({
              call:     "charlifter.langs"
            , version:  version
            , locale:   locale
        }, success, error);
        request.send(request._call);
    },

    lift : function(lang, text, success, error) {
        /* API Call: Lift text */
        let prefs = Components.classes["@mozilla.org/preferences-service;1"]
            .getService(Components.interfaces.nsIPrefService);
        let locale  = prefs.getBranch("general.useragent.").getCharPref("locale");
        request = this.genRequest({
              call:     "charlifter.lift"
            , lang:     lang
            , text:     text
            , locale:   locale
        }, success, error);
        request.send(request._call);
        /* Store last used language code and localization in preferences */
        let cprefs  = prefs.getBranch("charlifter.languages.");
        Charlifter.SQL.getLangLocalization(lang, {
            handleResult: function(aResult) {
                cprefs.setCharPref("selection-localized"
                    , aResult.getNextRow().getResultByName("localization")
                );
                cprefs.setCharPref("selection-code", lang);
            },
            handleError: function(aError) {
                window.alert("Error with getting language localization.");
            },
        });
    },

    liftSelection : function(lang) {
        /* Makes lift function specific to form element */
        let focused = document.commandDispatcher.focusedElement;
        focused.disabled = true;
        this.lift(lang, focused.value, function(aSuccess) {
            let owner = Charlifter.Lifter;
            let response = JSON.parse(aSuccess.target.responseText);
            switch (response.code) {
                case owner.codes.liftSuccess:
                    focused.value = response.text;
                    break;
                case owner.codes.liftFailUnknown:
                    break;
                default:
                    break;
            }
            focused.disabled = false;
        }, function(aError) {
            focused.disabled = false;
            window.alert("Failure with call: " + request._call);
        });
    },
};

window.addEventListener("load", function() {
        Charlifter.Lifter.init();
    }, false);
