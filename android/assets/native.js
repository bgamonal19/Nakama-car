(function () {
  if (window.__nakamaNativeInstalled || location.origin !== 'https://nakama-car-web-production.up.railway.app') return;
  window.__nakamaNativeInstalled = true;
  window.__nakamaReadBlob = function (url) {
    if (!String(url).startsWith('blob:' + location.origin + '/')) return;
    if (window.__nakamaPdfBusy) return;
    window.__nakamaPdfBusy = true;
    fetch(url).then(function (response) { return response.blob(); }).then(function (blob) {
      if (blob.size > 16 * 1024 * 1024) throw new Error('PDF troppo grande / PDF demasiado grande');
      var reader = new FileReader();
      reader.onload = function () {
        window.__nakamaPendingPdf = { data: String(reader.result).split(',')[1], name: 'NAKAMA-CAR.pdf' };
        location.href = 'nakama-download://pdf';
      };
      reader.onerror = function () { window.__nakamaPdfBusy = false; alert('PDF non disponibile / PDF no disponible'); };
      reader.readAsDataURL(blob);
    }).catch(function () { window.__nakamaPdfBusy = false; alert('PDF non disponibile / PDF no disponible'); });
  };
  window.open = function (url) {
    if (typeof url !== 'string') return null;
    if (url.startsWith('blob:' + location.origin + '/')) window.__nakamaReadBlob(url);
    else {
      try {
        var target = new URL(url, location.href);
        if (['https:', 'mailto:', 'tel:'].includes(target.protocol)) location.href = target.href;
      } catch (_) {}
    }
    return null;
  };
})();
