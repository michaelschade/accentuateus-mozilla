/*
    Copyright 2010 Spearhead Development, L.L.C. <http://www.sddomain.com/>
    
    This file is part of Accentuate.us.
    
    Accentuate.us is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Accentuate.us is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU General Public License for more details.
    
    You should have received a copy of the GNU General Public License
    along with Accentuate.us. If not, see <http://www.gnu.org/licenses/>.
*/
if ("undefined" == typeof(Charlifter)) {
    var Charlifter = {};
};

let logging = false;
function log(error) {
    if (logging) {
        try {
            let dirService = Components.classes[
                "@mozilla.org/file/directory_service;1"].getService(
                    Components.interfaces.nsIProperties
                );
            let file = dirService.get("ProfD", Components.interfaces.nsIFile);
            file.append("accentuateus.txt");
            var foStream = Components.classes[
                "@mozilla.org/network/file-output-stream;1"].createInstance(
                    Components.interfaces.nsIFileOutputStream
                );
            foStream.init(file, 0x02 | 0x08 | 0x10, 0666, 0);
            var converter = Components.classes[
                "@mozilla.org/intl/converter-output-stream;1"].createInstance(
                    Components.interfaces.nsIConverterOutputStream
                );
            converter.init(foStream, "UTF-8", 0, 0);
            converter.writeString(error + '\n');
            converter.close();
        } catch(err) {}
    }
}

Charlifter.SQL = function() {
    let db = null;
    let prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Ci.nsIPromptService);
    let connect = function() {
        /* Connects to sqlite file if not already done so */
        if (db === null) {
            let file  = Components.classes["@mozilla.org/file/"
                        + "directory_service;1"]
                         .getService(Components.interfaces.nsIProperties)
                         .get("ProfD", Components.interfaces.nsIFile);
            file.append("accentuateus.sqlite");
            let storageService = Components.classes["@mozilla.org/storage"
                                 + "/service;1"]
                                    .getService(Components.interfaces
                                        .mozIStorageService);
            try {
                db = storageService.openDatabase(file);
                db.executeSimpleSQL(
                    "CREATE TABLE IF NOT EXISTS langs (code VARCHAR(5)"
                        + ", localization VARCHAR(255))"
                );
            }
            catch(err) {
                log(err);
                prompts.alert(window
                    , strbundle.getString("errors-title")
                    , strbundle.getString("errors-malfunction")
                );
            }
            // Initialize lang table if not in existence
        }
    };
    let query = function(query) {
        /* Connects to db if necessary and creates query statement */
        if (db === null) { connect(); }
        return db.createStatement(query);
    };
    return {
        clearLangs : function(callbacks) {
            /* Clears languages from database. */
            let statement = query("DELETE FROM langs");
            statement.executeAsync(callbacks);
        },
        newLangs : function(langs, callbacks) {
            /* Takes languages as [[ISO-639, Localized Name],
                [ISO 639, Localized Name], ...] */
            let statement = query("INSERT INTO langs (code, localization)"
                + " VALUES (:code, :localization)");
            let params = null;
            try { // newBindingParamsArray available
                let params = statement.newBindingParamsArray();
            } catch(err) {
                log(err);
            }
            if (params != null) {
                for (let lang in langs) {
                    let bp = params.newBindingParams();
                    bp.bindByName("code",        langs[lang][0]);
                    bp.bindByName("localization",langs[lang][1]);
                    params.addParams(bp);
                }
                statement.bindParameters(params);
                statement.executeAsync(callbacks);
            }
            else {
                for (let lang in langs) {
                    statement.params.code = langs[lang][0];
                    statement.params.localization = langs[lang][1];
                    if (lang==langs.length) { // Last element
                        statement.executeAsync(callbacks);
                    }
                    else { statement.executeAsync({}); }
                }
            }
        },
        getLangs : function(callbacks) {
            /* Return languages. */
            let statement = query("SELECT code, localization FROM langs");
            statement.executeAsync(callbacks);
        },
        getNumLangs : function(callbacks) {
            /* Return languages. */
            let statement = query("SELECT count(*) FROM langs");
            statement.executeAsync(callbacks);
        },
        getLangLocalization : function(code, callbacks) {
            /* Provides stored lang localization when provided ISO 639 code. */
            let statement = query("SELECT localization FROM langs WHERE code "
                + "== :code LIMIT 1");
            statement.params.code = code;
            statement.executeAsync(callbacks);
        },
    }
}();

Charlifter.Lifter = function() {
    let codes = { // API Response Codes
          liftSuccess       : 200
        , liftFailUnknown   : 400
        , langListOutdated  : 100
        , langListCurrent   : 200
    };
    let populatedLangTable = false;
    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    let cprefs = prefs.getBranch("charlifter.languages.");
    let strbundle   = null;
    let prompts     = Cc["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Ci.nsIPromptService);
    let version = 'err';
    let genRequest     = function(args, success, error, abort) {
        /* Abstracts API calling code */
        let BASE_URL = "api.accentuate.us:8080/";
        let url = "http://";
        if  ("undefined" == typeof(args['lang']) ||
            (args['call'] == 'charlifter.feedback')) {
                url += BASE_URL;
        }
        else { url += args['lang'] + '.' + BASE_URL; }
        try {
            let durl = prefs.getBranch("charlifter.debug.")
                .getCharPref("hostname");
            url = durl;
        } catch(err) {
            log(err);
        }
        let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
            .createInstance(Ci.nsIXMLHttpRequest);
        request.open("POST", url, true);
        request.onload  = success;
        request.onerror = error;
        request.onabort = abort;
        request.setRequestHeader("User-Agent", "Accentuate.us/" + version
            + ' ' + window.navigator.userAgent);
        request.setRequestHeader("Content-Type", "application/json");
        request.setRequestHeader("charset", "UTF-8");
        request.send(JSON.stringify(args));
        return request;
    };
    let populateLangsMenu = function() {
        /* Populate language list menu. */
        let langsMenu = document.getElementById(
            "charlifter-cmenu-languages-item");
        Charlifter.SQL.getLangs({
            handleResult: function(aResultSet) {
                let menupopup = langsMenu.firstChild;
                while (menupopup.hasChildNodes()) {
                    menupopup.removeItemAt(0);
                }
                for (let row=aResultSet.getNextRow();
                    row; row=aResultSet.getNextRow()) {
                        let ele = langsMenu.appendItem(
                            ( row.getResultByName("code")
                            + ": "
                            + row.getResultByName("localization")
                            ), row.getResultByName("code")
                        );
                        ele.setAttribute("oncommand",
                            "Charlifter.Lifter.liftSelection('"
                                + row.getResultByName("code") + "')");
                }
            },
            handleError: function(aError) {
                prompts.alert(window
                    , strbundle.getString("errors-title")
                    , strbundle.getString("errors-communication")
                );
            },
            handleCompletion: function(aCompletion) {},
        });
    };
    let S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    }
    let uuid = function() {
       return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
    }
    let cid = "_-charlifter-id"; // Charlifter attribute name
    let pageElements = {};
    let setLastLang = function() {
        let liftItem    = document.getElementById(
            "charlifter-cmenu-item-lift");
        let lang = cprefs.getCharPref("selection-code");
        Charlifter.SQL.getLangLocalization(lang, {
            handleResult: function(aResult) {
                liftItem.setAttribute("label"
                    , strbundle.getFormattedString("lift-citem-label", [
                          aResult.getNextRow().getResultByName(
                            "localization")
                        , lang
                    ]
                ));
            },
            handleError: function(aError) {
                prompts.alert(window
                    , strbundle.getString(
                        "errors-lang-localization-title")
                    , strbundle.getString(
                        "errors-lang-localization"));
            },
            handleCompletion: function(aCompletion) {},
        });
        liftItem.setAttribute("oncommand",
            "Charlifter.Lifter.liftSelection('"
                + lang + "')");
    };
    return {
        init : function(ver) {
            version = ver;
            strbundle = document.getElementById("charlifter-string-bundle");
            let liftItem = document.getElementById(
                "charlifter-cmenu-item-lift");
            liftItem.accesskey = strbundle.getString(
                "lift-citem-label-accesskey");
            /* Create dynamic menu of available languages */
            let contextMenu = document.getElementById("contentAreaContextMenu");
            contextMenu.addEventListener("popupshowing", this.readyContextMenu
                , false);
            // If database empty, ensure version = 0
            Charlifter.SQL.getNumLangs({
                handleResult: function(aR) {
                    if (aR.getNextRow().getResultByIndex(0) == 0) {
                        cprefs.setIntPref("version", 0);
                    }
                },
                handleError: function(aE) {},
                handleCompletion: function(aC) {},
            });
            populateLangsMenu();
            this.populateLangTable();
            setLastLang();
        },
        populateLangTable : function() {
            this.getLangs(function(aSuccess) {
                let response = {};
                try {
                    response = JSON.parse(aSuccess.target.responseText);
                } catch(err) {
                    log(err);
                    prompts.alert(window
                        , strbundle.getString("errors-title")
                        , strbundle.getString("errors-communication"));
                }
                switch(response.code) {
                    case codes.langListOutdated:
                        /* New list available. Clear old languages
                            and insert new list to database. */
                        let langs = response.text.split('\n');
                        for (let langPair in langs) {
                            langs[langPair] = langs[langPair].split(':');
                        }
                        Charlifter.SQL.clearLangs({
                            handleResult: function(aResultSet) {},
                            handleError: function(aError) {},
                            handleCompletion: function(aCompletion) {},
                        });
                        Charlifter.SQL.newLangs(langs, {
                            handleResult: function(aResultSet) {},
                            handleError: function(aError) {
                                populateLangsMenu();
                            },
                            handleCompletion: function(aCompletion) {
                                populateLangsMenu();
                            },
                        });
                        cprefs.setIntPref("version", response.version);
                        populatedLangTable = true;
                        break;
                    case codes.langListCurrent:
                        populateLangsMenu();
                        populatedLangTable = true;
                        break;
                    default:
                        populateLangsMenu();
                        break;
                }
            }, function(aError) {
                populateLangsMenu();
            }, function(aA) {});
        },
        readyContextMenu : function(aE) {
            /* Hide context menu elements where appropriate */
            let liftItem    = document.getElementById(
                "charlifter-cmenu-item-lift");
            let langsMenu   = document.getElementById(
                "charlifter-cmenu-languages-item");
            let liftCancelItem = document.getElementById(
                "charlifter-cmenu-item-lift-cancel");
            let liftFeedbackItem = document.getElementById(
                "charlifter-cmenu-item-lift-feedback");
            let focused = document.commandDispatcher.focusedElement;
            /*  Only display feedback item if
                text is selected inside of text input */
            if (gContextMenu.onTextInput) {
                let selectedText = '';
                try {
                    selectedText = focused.value.substring(
                          focused.selectionStart
                        , focused.selectionEnd
                    );
                } catch(err) { // other HTML element
                    log(err);
                    focused = document.commandDispatcher
                        .focusedWindow.document;
                    selectedText = focused.getSelection();
                }
                if (selectedText != "") { liftFeedbackItem.disabled = false; }
                else { liftFeedbackItem.disabled = true; }
            }
            else {
                liftFeedbackItem.disabled = true;
            }
            if (langsMenu.childNodes[0].childNodes.length != 0) {
                setLastLang();
                let request = null;
                try {
                    request = pageElements[focused.getAttribute(cid)];
                } catch(err) {
                    log(err);
                }
                // Check if something is being lifted
                if (request != null) {
                    liftCancelItem.disabled = false;
                    liftItem.disabled       = true;
                    langsMenu.disabled      = true;
                }
                else {
                    liftCancelItem.disabled = true;
                    liftItem.disabled       = !(gContextMenu.onTextInput);
                    langsMenu.disabled      = !(gContextMenu.onTextInput);
                }
            }
            // No languages in menu, populate
            else {
                liftItem.disabled           = true;
                langsMenu.disabled          = true;
                liftCancelItem.disabled     = true;
                Charlifter.Lifter.populateLangTable();
            }
            liftItem.hidden = (liftItem.label == '') ? true : false;
        },
        getLangs : function(success, error, abort) {
            /* API Call: Get language list */
            let locale = window.navigator.language;
            let version = 0; // Forces new list retrieval
            if (locale == cprefs.getCharPref("locale")) {
                version = cprefs.getIntPref("version");
            }
            else { // Charlifter Locale Mismatch
                cprefs.setCharPref("locale", locale);
            }
            let request = genRequest({
                  call:     "charlifter.langs"
                , version:  version
                , locale:   locale
            }, success, error, abort);
            return request;
        },
        lift : function(lang, text, success, error, abort) {
            /* API Call: Lift text */
            let locale = window.navigator.language;
            let request = genRequest({
                  call:     "charlifter.lift"
                , lang:     lang
                , text:     text
                , locale:   locale
            }, success, error, abort);
            /* Store last used language code and localization in preferences */
            cprefs.setCharPref("selection-code", lang);
            return request;
        },
        cancelLift : function(cid) {
            pageElements[cid].abort();
            pageElements[cid] = null;
        },
        cancelLiftSelection : function() {
            let focused = document.commandDispatcher.focusedElement;
            try {
                this.cancelLift(focused.getAttribute(cid));
            } catch(err) {
                log(err);
            }
            focused.readOnly = false;
        },
        liftSelection : function(lang) {
            /* Makes lift function specific to form element */
            let focused = document.commandDispatcher.focusedElement;
            let ihtml = false;
            if(!focused) { // Get from other HTML element
                focused = document.commandDispatcher
                    .focusedWindow.document.activeElement;
            }
            focused.readOnly = true;
            let ocursor = focused.style.cursor;
            let value = focused.value;
            if (typeof(value) == 'undefined') {
                ihtml = true;
                value = focused.innerHTML;
            }
            focused.style.cursor = "wait";
            if (!focused.hasAttribute(cid)) {
                focused.setAttribute(cid, uuid());
            }
            pageElements[focused.getAttribute(cid)]
                = this.lift(lang, value, function(aSuccess) {
                    let response = {};
                    try {
                        response = JSON.parse(aSuccess.target.responseText);
                    } catch(err) {
                        log(err);
                        focused.readOnly = false;
                        focused.style.cursor = ocursor;
                        prompts.alert(window
                            , strbundle.getString("errors-title")
                            , strbundle.getString("errors-communication"));
                    }
                    switch (response.code) {
                        case codes.liftSuccess:
                            if (ihtml) { focused.innerHTML = response.text; }
                            else { focused.value = response.text; }
                            break;
                        case codes.liftFailUnknown:
                            prompts.alert(window
                                , strbundle.getString("errors-title")
                                , response.text);
                            break;
                        default:
                            break;
                    }
                    focused.readOnly = false;
                    focused.style.cursor = ocursor;
                    pageElements[focused.getAttribute(cid)] = null;
                }, function(aError) {
                    focused.readOnly = false;
                    focused.style.cursor = ocursor;
                    pageElements[focused.getAttribute(cid)] = null;
                    prompts.alert(window,
                          strbundle.getString("errors-title")
                        , strbundle.getString("errors-communication"));
                }, function(aAbort) {
                    focused.style.cursor = ocursor;
                });
        },
        feedback : function(text, success, error, abort) {
            let request = genRequest({
                  call:     "charlifter.feedback"
                , "lang":   cprefs.getCharPref("selection-code")
                , "locale": cprefs.getCharPref("locale")
                , "text":   text
            }, success, error, abort);
            return request;
        },
        feedbackSelection : function() {
            // No previous successful feedback submission
            let result = 2;
            if (!cprefs.getBoolPref("feedback-success")) {
                result = prompts.confirmEx(
                      window
                    , strbundle.getString("feedback-confirm-title")
                    , strbundle.getString("feedback-confirm")
                    , (prompts.BUTTON_POS_0) * (prompts.BUTTON_TITLE_YES)
                        + (prompts.BUTTON_POS_1) * (prompts.BUTTON_TITLE_NO)
                        + (prompts.BUTTON_POS_2) * (prompts.BUTTON_TITLE_CANCEL)
                    , ""
                    , ""
                    , ""
                    , null
                    , {}
                );
                switch(result) {
                    case 0: // Yes
                        cprefs.setBoolPref("feedback-success", true);
                        break;
                    case 1: // No
                        prompts.alert(window
                            , strbundle.getString("feedback-confirm-title")
                            , strbundle.getString("feedback-fail")
                        );
                        break;
                    case 2:
                    default:
                        break;
                }
            }
            // They've done this before...
            else { result = 0; }
            if (result == 0) {
                let selectedText = '';
                let focused = document.commandDispatcher.focusedElement;
                try {
                    selectedText = focused.value.substring(
                          focused.selectionStart
                        , focused.selectionEnd
                    );
                } catch(err) { // other HTML element
                    log(err);
                    focused = document.commandDispatcher
                        .focusedWindow.document;
                    selectedText = focused.getSelection();
                }
                // Fail silently
                try {
                this.feedback(selectedText, function(aSuccess) {
                    }, function(aError) {}, function(aAbort) {}
                );
                } catch(err) {
                    log(err);
                }
                if (!cprefs.getBoolPref("feedback-success-hide")) {
                    let hide = {value: false};
                    prompts.alertCheck(window
                        , strbundle.getString("feedback-success-title")
                        , strbundle.getString("feedback-success")
                        , strbundle.getString("feedback-success-hide")
                        , hide
                    );
                    if (hide.value) {
                        cprefs.setBoolPref("feedback-success-hide"
                            , true);
                    }
                }
            }
        },
    }
}();

window.addEventListener("load", function() {
    // Have to get version now due to new asynchronous style
    log("Initializing add-on.");
    try { // Old addon manager
        let gExtensionManager = Components.classes[
            "@mozilla.org/extensions/manager;1"]
                .getService(Components.interfaces.nsIExtensionManager);
        let version = gExtensionManager.getItemForID(
            "addons-mozilla@accentuate.us").version;
        Charlifter.Lifter.init(version);
    } catch(err) { // New addon manager
        log(err);
        Components.utils.import("resource://gre/modules/AddonManager.jsm");
            AddonManager.getAddonByID("addons-mozilla@accentuate.us",
                function(addon) { Charlifter.Lifter.init(addon.version); }
            );
    }
}, false);
