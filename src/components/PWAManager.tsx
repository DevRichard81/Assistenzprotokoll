import React, { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, RefreshCw, X, Share } from 'lucide-react';

export default function PWAManager() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    // Detect if already installed/standalone
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    // Detect iOS
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    if (isIos && !isStandalone) {
      setShowIosPrompt(true);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    });

    window.addEventListener('appinstalled', () => {
      setShowInstallButton(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    });
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setShowIosPrompt(false);
  };

  return (
    <>
      {/* iOS Manual Install Instructions */}
      {showIosPrompt && (
        <div className="fixed bottom-20 right-6 left-6 md:left-auto md:w-80 bg-blue-600 text-white p-5 rounded-2xl shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-10 duration-500">
          <button onClick={close} className="absolute top-2 right-2 p-1 hover:bg-blue-700 rounded-full transition-colors">
            <X size={18} />
          </button>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="bg-white/20 p-3 rounded-full">
              <Download size={32} />
            </div>
            <div>
              <h4 className="font-bold text-lg">App installieren</h4>
              <p className="text-sm text-blue-100 mt-1">
                Tippen Sie auf <Share size={18} className="inline mx-1" /> und dann auf <strong>"Zum Home-Bildschirm"</strong>, um die App offline zu nutzen.
              </p>
            </div>
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-600 rotate-45"></div>
        </div>
      )}

      {/* Install Button - Fixed at bottom right (Android/Chrome) */}
      {showInstallButton && (
        <button
          onClick={handleInstallClick}
          className="fixed bottom-20 right-6 bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 transition-all z-50 flex items-center gap-2 group"
          title="App installieren"
        >
          <Download size={24} />
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-bold whitespace-nowrap">
            App installieren
          </span>
        </button>
      )}

      {/* PWA Notifications */}
      {(offlineReady || needRefresh) && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 bg-white border border-gray-200 rounded-xl shadow-2xl p-4 z-[100] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-start gap-4">
            <div className={`p-2 rounded-lg ${needRefresh ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
              {needRefresh ? <RefreshCw size={24} className="animate-spin-slow" /> : <Download size={24} />}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-gray-900">
                {needRefresh ? 'Update verfügbar' : 'Bereit für Offline-Nutzung'}
              </h4>
              <p className="text-sm text-gray-500 mt-1">
                {needRefresh 
                  ? 'Eine neue Version der App ist verfügbar. Möchten Sie jetzt aktualisieren?' 
                  : 'Die App wurde erfolgreich für die Offline-Nutzung vorbereitet.'}
              </p>
              <div className="mt-4 flex gap-3">
                {needRefresh ? (
                  <button
                    onClick={() => updateServiceWorker(true)}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Aktualisieren
                  </button>
                ) : (
                  <button
                    onClick={close}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors"
                  >
                    Verstanden
                  </button>
                )}
                <button
                  onClick={close}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
