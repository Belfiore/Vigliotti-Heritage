// Mobile nav toggle (shared by every page)
(function () {
    var t = document.getElementById('navToggle'), l = document.getElementById('navLinks');
    if (!t || !l) return;
    t.addEventListener('click', function () {
        var open = l.classList.toggle('open');
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    l.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { l.classList.remove('open'); t.setAttribute('aria-expanded', 'false'); });
    });
})();
