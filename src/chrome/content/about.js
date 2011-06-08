/*
    Copyright 2010 Spearhead Development, L.L.C. <http://www.spearheaddev.com/>
    
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

Charlifter.About = function() {
    let link = function(link, text) {
        /* Returns HTML element string to open link in dialog.
        Text is optional. */
        if (typeof(text) == 'undefined') { text = link; }
        return '<html:a href="#" onclick="window.open(\'' + link + '\');">'
            + text + '</html:a>';
    };
    let content = function(section, vars, appendText) {
        /* Sets the about dialog's content based on section and links.
        Vars may be a list or a string. appendText is optional. */
        if (typeof(vars) == 'string') { vars = [vars]; }
        let strbundle = document.getElementById("charlifter-string-bundle");
        // vars may be empty but this is okay for our limited use
        let text = strbundle.getFormattedString("about-" + section, vars);
        if (typeof(appendText) != 'undefined') { text += ' ' + appendText; }
        document.getElementById(section).innerHTML = text;
    };
    return {
        init : function() {
            let description = document.getElementById("about-description");
            let site = "http://accentuate.us/";
            content('accentuateus', link(site, 'Accentuate.us'));
            content('privacy', [], link(site + 'privacy'));
            content('copyright', link('http://www.sddomain.com/'
                , 'Spearhead Development L.L.C.'));
            content('license', link('http://www.gnu.org/licenses/gpl.html'
                , 'GPLv3'));
            content('contribute', [], link(site + 'contributing'));
        },
    }
}();

window.addEventListener("load", function() {
        Charlifter.About.init();
    }, false);
