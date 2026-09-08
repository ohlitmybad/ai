function toggleDarkMode() {
    const body = document.querySelector("body");
    body.classList.toggle("dark-mode");

    const isDarkMode = body.classList.contains("dark-mode");
    localStorage.setItem("darkMode", isDarkMode);
}

document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem("darkMode") === "true") {
        document.querySelector("body").classList.add("dark-mode");
    }
});

function getPreferredLanguage() {
    // PRIORITY 1: URL parameter
    const langParam = new URLSearchParams(window.location.search).get('lang');
    if (langParam) return langParam;

    // PRIORITY 2: localStorage
    const storedLang = localStorage.getItem('preferredLanguage');
    if (storedLang) return storedLang;

    // PRIORITY 3: browser language
    return getBrowserLanguage() || 'en';
}

function getBrowserLanguage() {
    return (navigator.language || '').slice(0, 2);
}

function applyLanguage(language) {
    if (language === 'en') return;

    fetch(`locales/${language}.json`)
        .then(response => (response.ok ? response.json() : null))
        .then(translations => {
            if (!translations) return;

            window.currentTranslations = translations;
            window.translations = translations;
            window.translateElement = translateElement;

            document.querySelectorAll('[data-i18n]').forEach(element => {
                translateElement(element, translations);
            });

            if (window.translationObserver) return;

            // Added nodes are queued and translated once per frame. Doing it per
            // mutation record meant a querySelectorAll for every message, typing
            // dot and status rewrite.
            let pending = [];
            let scheduled = false;

            function flush() {
                scheduled = false;
                const nodes = pending;
                pending = [];

                for (const node of nodes) {
                    if (!node.isConnected) continue;
                    if (node.hasAttribute && node.hasAttribute('data-i18n')) {
                        translateElement(node, translations);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('[data-i18n]').forEach(element => {
                            translateElement(element, translations);
                        });
                    }
                }
            }

            window.translationObserver = new MutationObserver(function (mutations) {
                for (const mutation of mutations) {
                    if (mutation.type !== 'childList') continue;
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) pending.push(node);
                    }
                }
                if (pending.length && !scheduled) {
                    scheduled = true;
                    requestAnimationFrame(flush);
                }
            });

            window.translationObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        })
        .catch(() => {});
}

function translateElement(element, translations) {
    if (!element || !translations) return;

    const raw = element.getAttribute('data-i18n');
    if (!raw) return;

    let value = translations;
    for (const key of raw.split('.')) {
        if (value === undefined || value === null) break;
        value = value[key];
    }

    if (!value || typeof value !== 'string') return;

    const attrTarget = element.getAttribute('data-i18n-attr');
    if (attrTarget) {
        element.setAttribute(attrTarget, value);
        return;
    }

    if (element.tagName === 'META') {
        element.setAttribute('content', value);
    } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.setAttribute('placeholder', value);
    } else if (value.includes('<')) {
        element.innerHTML = value;
    } else {
        element.textContent = value;
    }
}

applyLanguage(getPreferredLanguage());
