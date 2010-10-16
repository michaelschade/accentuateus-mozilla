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
if ("undefined" == typeof(Charlifter)) { var Charlifter = {}; };


Charlifter.Util = function() {
    let prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService).getBranch(
            "accentuateus.debug."
        );
    let logging = false;
    try { logging = prefs.getBoolPref("logging"); }
    catch (err) {}
    return {
        log : function(error) {
            if (logging) { try {
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
            } catch(err) {} }
        },
    }
}();

/* Handles SQLite code for add-on */
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
                // Initialize lang table if not in existence
                db.executeSimpleSQL(
                    "CREATE TABLE IF NOT EXISTS langs (code VARCHAR(5)"
                        + ", localization VARCHAR(255))"
                );
            }
            catch(err) {
                Charlifter.Util.log(err);
                prompts.alert(window
                    , strbundle.getString("errors-title")
                    , strbundle.getString("errors-malfunction")
                );
            }
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
            /* Stores languages. langs input: [[ISO-639, Localized Name],
                [ISO 639, Localized Name], ...] */
            let statement = query("INSERT INTO langs (code, localization)"
                + " VALUES (:code, :localization)");
            let params = null;
            try { // newBindingParamsArray available
                params = statement.newBindingParamsArray();
            } catch(err) { Charlifter.Util.log(err); }
            if (params != null) { // Firefox 3.6+
                for (let lang in langs) {
                    let bp = params.newBindingParams();
                    bp.bindByName("code",        langs[lang][0]);
                    bp.bindByName("localization",langs[lang][1]);
                    params.addParams(bp);
                }
                statement.bindParameters(params);
                statement.executeAsync(callbacks);
            }
            else { // Firefox 3.5
                for (let lang in langs) {
                    statement.params.code = langs[lang][0];
                    statement.params.localization = langs[lang][1];
                    if (lang == langs.length-1) { // Last element
                        statement.executeAsync(callbacks);
                    }
                    else { statement.executeAsync(); }
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

/* Handles user-interface and communication aspects for add-on */
Charlifter.Lifter = function() {
    let codes = { // API Response Codes
          liftSuccess       : 200
        , liftFailUnknown   : 400
        , langListOutdated  : 100
        , langListCurrent   : 200
    };
    let prefs   = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefService);
    let prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(Ci.nsIPromptService);
    let cprefs  = prefs.getBranch("accentuateus.languages.");
    let version = 'err';
    let cid     = "_-accentuateus-id"; // Charlifter attribute name
    let pageElements= {};
    let strbundle   = null;
    let lastLang    = {lang: '', label: ''}
    let genRequest  = function(args, success, error, abort) {
        /* Abstracts API calling code */
        let BASE_URL = "api.accentuate.us:8080/";
        let url = "http://";
        if  ("undefined" == typeof(args['lang']) ||
            (args['call'] == 'charlifter.feedback')) {
                url += BASE_URL;
        }
        else { url += args['lang'] + '.' + BASE_URL; }
        try {
            let durl = prefs.getBranch("accentuateus.debug.")
                .getCharPref("hostname");
            url = durl;
        } catch(err) { Charlifter.Util.log(err); }
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
                            + ": " + row.getResultByName("localization")
                            ), row.getResultByName("code")
                        );
                        ele.setAttribute("oncommand",
                            "Charlifter.Lifter.liftSelection('"
                                + row.getResultByName("code") + "')");
                }
            },
            handleError: function(aError) {
                Charlifter.Util.log(aError);
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
    let setLastLang = function() {
        /* Sets context menu default last language */
        let liftItem = document.getElementById(
            "charlifter-cmenu-item-lift");
        let lang = cprefs.getCharPref("selection-code");
        liftItem.hidden = true; // Default to hidden
        Charlifter.SQL.getLangLocalization(lang, {
            handleResult: function(aResult) {
                lastLang.lang = lang;
                lastLang.label = aResult.getNextRow().getResultByName(
                    "localization");
                liftItem.hidden = false;
            },
            handleError: function(aError) {
                Charlifter.Util.log(aError);
                prompts.alert(window
                    , strbundle.getString(
                        "errors-lang-localization-title")
                    , strbundle.getString(
                        "errors-lang-localization"));
            },
            handleCompletion: function(aCompletion) {},
        });
        liftItem.setAttribute("oncommand",
            "Charlifter.Lifter.liftSelection('" + lang + "')");
    };
    let getSelection = function() {
        /* Gets selected text either from standard element or iframe */
        let selectedText = '';
        let focused = document.commandDispatcher.focusedElement;
        try {
            selectedText = focused.value.substring(
                  focused.selectionStart
                , focused.selectionEnd
            );
        } catch(err) { // other HTML element
            Charlifter.Util.log(err);
            focused = document.commandDispatcher
                .focusedWindow;
            selectedText = focused.getSelection().toString();
        }
        return selectedText;
    };
    let getLocale = function() {
        let locale = window.navigator.language;
        try {
            locale = prefs.getBranch("accentuateus.debug.")
                .getCharPref("locale");
        } catch(err) { Charlifter.Util.log(err); }
        return locale;
    };
    return {
        init : function(ver) {
            /* Initializes Lifter */
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
                handleError: function(aE) { Charlifter.Util.log(aE); },
                handleCompletion: function(aC) {
                    Charlifter.Lifter.populateLangTable();
                    setLastLang();
                },
            });
        },
        populateLangTable : function() {
            /* Populates language table with new list */
            this.getLangs(function(aSuccess) {
                let response = {};
                try {
                    response = JSON.parse(aSuccess.target.responseText);
                } catch(err) {
                    Charlifter.Util.log(err);
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
                            handleError: function(aError) {
                                Charlifter.Util.log(aError);
                            },
                            handleCompletion: function(aCompletion) {},
                        });
                        Charlifter.SQL.newLangs(langs, {
                            handleResult: function(aResultSet) {},
                            handleError: function(aError) {
                                Charlifter.Util.log(aError);
                                populateLangsMenu();
                            },
                            handleCompletion: function(aCompletion) {
                                populateLangsMenu();
                            },
                        });
                        cprefs.setIntPref("version", response.version);
                        setLastLang();
                        break;
                    case codes.langListCurrent:
                        populateLangsMenu();
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
                if (getSelection() != "") { liftFeedbackItem.disabled = false; }
                else { liftFeedbackItem.disabled = true; }
            }
            else { liftFeedbackItem.disabled = true; }
            /* Label for accentuating all or just selected text */
            let liftProperty, langsMenuProperty;
            if (!getSelection()) {
                liftProperty = "lift-citem-label";
                langsMenuProperty = "lift-cmenu-label";
            } else {
                liftProperty = "lift-citem-selection-label";
                langsMenuProperty = "lift-cmenu-label-selected";
            }
            liftItem.label = strbundle.getFormattedString(liftProperty
                , [lastLang.label, lastLang.lang]
            );
            langsMenu.label = strbundle.getString(langsMenuProperty);
            if (langsMenu.childNodes[0].childNodes.length != 0) {
                let request = null;
                try {
                    request = pageElements[focused.getAttribute(cid)];
                } catch(err) { Charlifter.Util.log(err); }
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
        },
        getLangs : function(success, error, abort) {
            /* API Call: Get language list */
            let locale = getLocale();
            let version = 0; // Forces new list retrieval
            if (locale == cprefs.getCharPref("locale")) {
                version = cprefs.getIntPref("version");
            }
            else { // Locale Mismatch
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
            let request = genRequest({
                  call:     "charlifter.lift"
                , lang:     lang
                , text:     text
                , locale:   getLocale()
            }, success, error, abort);
            /* Store last used language code and localization in preferences */
            cprefs.setCharPref("selection-code", lang);
            setLastLang();
            return request;
        },
        cancelLift : function(cid) {
            /* Cancels indexed lift (slow network, etc.) */
            pageElements[cid].abort();
            pageElements[cid] = null;
        },
        cancelLiftSelection : function() {
            /* Cancels lift for element */
            let focused = document.commandDispatcher.focusedElement;
            try {
                this.cancelLift(focused.getAttribute(cid));
            } catch(err) { Charlifter.Util.log(err); }
            focused.readOnly = false;
        },
        liftSelection : function(lang) {
            /* Makes lift function specific to form element */
            let focused = document.commandDispatcher.focusedElement;
            if(!focused) { // Get from other HTML element
                focused = document.commandDispatcher
                    .focusedWindow.document.activeElement;
            }
            focused.readOnly = true;
            let ocursor = focused.style.cursor;
            let value   = focused.value;
            let selected= false;
            let ihtml   = false;
            let result  = {};
            if (typeof(value) == 'undefined') {
                ihtml = true;
                value = focused.innerHTML;
            }
            if (getSelection() != '') { // Handling only highlighted text
                if (ihtml) { // rich text
                    let selection = document.commandDispatcher
                        .focusedWindow.getSelection().getRangeAt(0);
                    // Tracker "layer" to later update selection
                    result.span = selection.startContainer.ownerDocument
                        .createElement("layer");
                    let docfrag = selection.extractContents();
                    result.span.appendChild(docfrag);
                    selection.insertNode(result.span);
                    value = result.span.innerHTML;
                }
                else { // other
                    result.begin= focused.value.substring(0
                        , focused.selectionStart);
                    result.end  = focused.value.substring(focused.selectionEnd);
                    result.stop = focused.selectionEnd;
                    value = focused.value.substring(focused.selectionStart
                        , focused.selectionEnd);
                }
                selected = true;
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
                        Charlifter.Util.log(err);
                        prompts.alert(window
                            , strbundle.getString("errors-title")
                            , strbundle.getString("errors-communication"));
                    }
                    switch (response.code) {
                        case codes.liftSuccess:
                            if (ihtml) {
                                if (selected) {
                                    result.span.innerHTML = response.text;
                                    // Remove our tracking "layer"
                                    while (result.span.firstChild) {
                                        result.span.parentNode.insertBefore(
                                              result.span.firstChild
                                            , result.span);
                                    }
                                    result.span.parentNode.removeChild(
                                        result.span);
                                }
                                else { focused.innerHTML = response.text; }
                            }
                            else if (selected) {
                                focused.value = result.begin + response.text
                                    + result.end;
                                focused.setSelectionRange(result.stop
                                    , result.stop);
                            }
                            else { focused.value = response.text; }
                            focused.focus();
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
            /* Submits feedback text for last used language */
            let request = genRequest({
                  call:     "charlifter.feedback"
                , "lang":   cprefs.getCharPref("selection-code")
                , "locale": getLocale()
                , "text":   text
            }, success, error, abort);
            return request;
        },
        feedbackSelection : function() {
            /* Submits selected text for feedback */
            // No previous successful feedback submission
            let result = 2;
            if (!cprefs.getBoolPref("feedback-success")) {
                // Confirm feedback submission
                result = prompts.confirmEx(window
                    , strbundle.getString("feedback-confirm-title")
                    , strbundle.getString("feedback-confirm")
                    , (prompts.BUTTON_POS_0) * (prompts.BUTTON_TITLE_YES)
                        + (prompts.BUTTON_POS_1) * (prompts.BUTTON_TITLE_NO)
                        + (prompts.BUTTON_POS_2) * (prompts.BUTTON_TITLE_CANCEL)
                    , "" , "", "", null, {}
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
                    case 2: // Cancel
                    default:
                        break;
                }
            }
            // They've done this before...
            else { result = 0; }
            if (result == 0) {
                this.feedback(getSelection(), function(aSuccess) {
                    }, function(aError) {}, function(aAbort) {}
                );
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
    Charlifter.Util.log("Initializing add-on.");
    try { // Old addon manager
        let gExtensionManager = Components.classes[
            "@mozilla.org/extensions/manager;1"]
                .getService(Components.interfaces.nsIExtensionManager);
        let version = gExtensionManager.getItemForID(
            "addons-mozilla@accentuate.us").version;
        Charlifter.Lifter.init(version);
    } catch(err) { // New addon manager
        Charlifter.Util.log(err);
        Components.utils.import("resource://gre/modules/AddonManager.jsm");
            AddonManager.getAddonByID("addons-mozilla@accentuate.us",
                function(addon) { Charlifter.Lifter.init(addon.version); }
            );
    }
}, false);
