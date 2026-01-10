/**
 * Detects if the application is running in mobile/phone mode or desktop mode
 *
 * This function checks multiple criteria:
 * 1. User agent string for mobile devices
 * 2. Touch capability
 * 3. Screen width (responsive breakpoint)
 * 4. Window dimensions
 *
 * @returns {boolean} true if mobile/phone mode, false if desktop mode
 */
export function isMobileDevice(): boolean {
  // Check if window is defined (SSR safety)
  if (typeof window === 'undefined') {
    return false;
  }

  // Check user agent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android',
    'webos',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
    'mobile'
  ];

  const isMobileUserAgent = mobileKeywords.some(keyword =>
    userAgent.includes(keyword)
  );

  // Check if device has touch capability
  const isTouchDevice = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );

  // Check screen width (common mobile breakpoint)
  const isSmallScreen = window.innerWidth < 768;

  // Return true if any mobile indicator is present
  return isMobileUserAgent || (isTouchDevice && isSmallScreen);
}

/**
 * Detects if the application is running in a webview (e.g., smart glasses, mobile app)
 *
 * @returns {boolean} true if running in a webview, false otherwise
 */
export function isWebView(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for common webview indicators
  const webViewIndicators = [
    'wv',                    // Android WebView
    'mentra',                // Custom Mentra indicator (if you set one)
    'smartglasses',          // Smart glasses indicator
  ];

  const isWebViewUserAgent = webViewIndicators.some(indicator =>
    userAgent.includes(indicator)
  );

  // Check for Android WebView specific property
  const isAndroidWebView = userAgent.includes('android') && userAgent.includes('wv');

  // Check for iOS WebView (standalone mode)
  const isIOSWebView = (window.navigator as any).standalone === true;

  return isWebViewUserAgent || isAndroidWebView || isIOSWebView;
}

/**
 * Gets the device type as a string
 *
 * @returns {'mobile' | 'tablet' | 'desktop'} device type
 */
export function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') {
    return 'desktop';
  }

  const width = window.innerWidth;

  // Mobile: < 768px
  if (width < 768) {
    return 'mobile';
  }

  // Tablet: 768px - 1024px
  if (width < 1024) {
    return 'tablet';
  }

  // Desktop: >= 1024px
  return 'desktop';
}

/**
 * Hook-like function that returns device state
 * Can be used in React components with useState if needed for reactivity
 *
 * @returns object with device detection properties
 */
export function getDeviceInfo() {
  return {
    isMobile: isMobileDevice(),
    isWebView: isWebView(),
    deviceType: getDeviceType(),
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
}
