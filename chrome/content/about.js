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

Charlifter.About = function() {
    let link = function(link) {
        /* Returns HTML element string to open link in dialog. */
        return '<html:a href="#" onclick="window.open(\'' + link + '\');">';
    };
    let content = function(section, links) {
        /* Sets the about dialog's content based on section and links. */
        let strbundle = document.getElementById("charlifter-string-bundle");
        let text = strbundle.getFormattedString("about-" + section, links);
        document.getElementById(section).innerHTML = text;
    };
    return {
        init : function() {
            let description = document.getElementById("about-description");
            let site = "http://www.accentuate.us/";
            content('accentuateus', [link(site)]);
            content('privacy', [link(site + 'privacy')]);
            content('copyright', [link('http://www.sddomain.com/')
                , link('http://www.gnu.org/licenses/gpl.html')
            ]);
            content('contribute', [link(site + 'contribute')]);
        },
    }
}();

window.addEventListener("load", function() {
        Charlifter.About.init();
    }, false);
