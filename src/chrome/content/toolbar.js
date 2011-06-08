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

Charlifter.Toolbar = function() {
    let btn = null;
    let on  = false;
    return {
        /* Initialize toolbar entry for live accentuation. */
        init : function() {
            btn = window.document.getElementById("accentuateus-live-button");
            this.disable();
        },
        /* Enable live accentuation. */
        enable : function() {
            try {
                Charlifter.Lifter.liveOn();
            } catch(e) { alert(e); }
            on = true;
            btn.setAttribute("label", "Disable");
            btn.setAttribute("tooltiptext", "Accentuate.us: Click to disable live accentuation");
            btn.setAttribute("oncommand", "Charlifter.Toolbar.disable();");
        },
        /* Disable live accentuation. */
        disable : function() {
            Charlifter.Lifter.liveOff();
            on = false;
            btn.setAttribute("label", "Enable");
            btn.setAttribute("tooltiptext", "Accentuate.us: Click to enable live accentuation");
            btn.setAttribute("oncommand", "Charlifter.Toolbar.enable();");
        },
        /* Toggle live accentuation on and off. */
        toggle : function() {
            if (on == true) {
                this.disable();
            } else this.enable();
        }
    }
}();

window.addEventListener("load", function() {
    Charlifter.Toolbar.init();
}, false);
