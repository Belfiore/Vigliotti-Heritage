// Renders data/discovery-timeline.json on the home page and the Discovery Timeline page.
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatFound(date) {
        if (!date) return '';
        var parts = String(date).split('-');
        if (parts.length === 3) {
            var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            var m = months[parseInt(parts[1], 10) - 1] || parts[1];
            return 'Found ' + parseInt(parts[2], 10) + ' ' + m + ' ' + parts[0];
        }
        if (parts.length === 2) {
            var months2 = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return 'Found ' + (months2[parseInt(parts[1], 10) - 1] || parts[1]) + ' ' + parts[0];
        }
        return 'Found ' + date;
    }

    function byFoundDateDesc(a, b) {
        if (a.foundDate === b.foundDate) return String(b.id || '').localeCompare(String(a.id || ''));
        return String(b.foundDate || '').localeCompare(String(a.foundDate || ''));
    }

    function cardHTML(find) {
        return '<div class="discovery-card" data-find-id="' + esc(find.id) + '">' +
            '<span class="discovery-era">' + esc(formatFound(find.foundDate)) + '</span>' +
            '<h3>' + esc(find.headline) + '</h3>' +
            (find.summary ? '<p>' + esc(find.summary) + '</p>' : '') +
            (find.sourceIds && find.sourceIds.length
                ? '<p class="discovery-source"><a href="research.html#' + encodeURIComponent(find.sourceIds[0]) + '">Source and records</a></p>'
                : '') +
            '</div>';
    }

    function itemHTML(find) {
        return '<div class="timeline-item" data-find-id="' + esc(find.id) + '">' +
            '<div class="timeline-year">' + esc(formatFound(find.foundDate)) + '</div>' +
            '<h3>' + esc(find.headline) + '</h3>' +
            (find.summary ? '<p>' + esc(find.summary) + '</p>' : '') +
            (find.sourceIds && find.sourceIds.length
                ? '<p><a href="research.html#' + encodeURIComponent(find.sourceIds[0]) + '">Source and records</a></p>'
                : '') +
            '</div>';
    }

    function fill(el, finds, asTimeline) {
        if (!el) return;
        var limit = parseInt(el.getAttribute('data-discovery-limit') || '', 10);
        var list = finds.slice();
        if (limit) list = list.slice(0, limit);
        el.innerHTML = list.map(asTimeline ? itemHTML : cardHTML).join('') ||
            '<p class="placeholder-text">No discoveries have been recorded yet.</p>';
    }

    fetch('data/discovery-timeline.json').then(function (r) {
        if (!r.ok) throw new Error('Could not load the discovery timeline');
        return r.json();
    }).then(function (data) {
        var finds = (data.finds || []).slice().sort(byFoundDateDesc);
        fill(document.getElementById('discoveryHome'), finds, false);
        fill(document.getElementById('discoveryTimeline'), finds, true);
        var fallback = document.getElementById('discoveryHomeFallback');
        if (fallback && fallback.parentNode) fallback.parentNode.removeChild(fallback);
        fallback = document.getElementById('discoveryFallback');
        if (fallback && fallback.parentNode) fallback.parentNode.removeChild(fallback);
    }).catch(function (e) {
        ['discoveryHome', 'discoveryTimeline'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.innerHTML = '<p class="placeholder-text">The discoveries could not be loaded (' + esc(e.message) + '). Serve the site over http, not file://.</p>';
        });
    });
})();
