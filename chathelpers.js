function toggleDarkMode() {
            const body = document.querySelector("body");
            body.classList.toggle("dark-mode");
            
            const isDarkMode = body.classList.contains("dark-mode");
            localStorage.setItem("darkMode", isDarkMode);
            
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            const storedDarkMode = localStorage.getItem("darkMode");
            
            if (storedDarkMode === "true") {
                const body = document.querySelector("body");
                body.classList.add("dark-mode");
            }
            
 
        });
function getPreferredLanguage() {
// PRIORITY 1: Check URL parameter first
const urlParams = new URLSearchParams(window.location.search);
const langParam = urlParams.get('lang');
if (langParam) {
return langParam;
}
// PRIORITY 2: Check localStorage
const storedLang = localStorage.getItem('preferredLanguage');
if (storedLang) {
return storedLang;
}
// PRIORITY 3: Use browser language
return getBrowserLanguage() || 'en';
}

function getBrowserLanguage() {
return navigator.language.slice(0, 2);
}

function applyLanguage(language) {
console.log(language);

if (language === 'en') {
return;
}


fetch(`locales/${language}.json`)
.then(response => {
  return response.ok ? response.json() : null;
})
.then(translations => {
  // Only proceed if translations exist
  if (translations) {
      window.currentTranslations = translations;
          window.translations = translations;
      
    // expose translator for dynamic usage
    window.translateElement = translateElement;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      translateElement(element, translations);
    });
    
    
    if (!window.translationObserver) {
      window.translationObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(function(node) {
              if (node.nodeType === 1) { // Element node
                if (node.hasAttribute && node.hasAttribute('data-i18n')) {
                  translateElement(node, translations);
                }
                const elements = node.querySelectorAll ? node.querySelectorAll('[data-i18n]') : [];
                elements.forEach(function(element) {
                  translateElement(element, translations);
                });
              }
            });
          }
        });
      });
      
      window.translationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
})
.catch(() => {
});
}

// Helper function to translate a single element
function translateElement(element, translations) {
  const keys = element.getAttribute('data-i18n').split('.');
  let value = translations;
  
  for (const key of keys) {
    if (value === undefined || value === null) break;
    value = value[key];
  }
  
  if (!value) return;

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

const preferredLanguage = getPreferredLanguage();
applyLanguage(preferredLanguage);