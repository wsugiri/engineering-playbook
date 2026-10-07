/**
 * CloudFront Function: Viewer Request (SPA Routing Rewrite)
 * 
 * Mengatasi masalah Deep-linking pada Single Page Application (SPA) di S3:
 * Jika user refresh di URL /turn-pro/match/101, fungsi ini me-rewrite request
 * ke /turn-pro/index.html agar S3 tidak me-return HTTP 404 / 403.
 */

function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Jika request mengarah ke file statis berekstensi (js, css, png, mp3, json, dll), biarkan lewat apa adanya
  if (uri.includes('.')) {
    return request;
  }

  // Jika subpath /turn-pro/ tanpa ekstensi file -> arahkan ke turn-pro/index.html
  if (uri.startsWith('/turn-pro')) {
    request.uri = '/turn-pro/index.html';
    return request;
  }

  // Jika subpath /coach/ -> arahkan ke coach/index.html
  if (uri.startsWith('/coach')) {
    request.uri = '/coach/index.html';
    return request;
  }

  // Jika subpath /member/ -> arahkan ke member/index.html
  if (uri.startsWith('/member')) {
    request.uri = '/member/index.html';
    return request;
  }

  // Default Root Core SPA
  if (uri === '/' || !uri.includes('.')) {
    request.uri = '/index.html';
    return request;
  }

  return request;
}
