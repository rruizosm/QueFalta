import type { ComponentType, RefAttributes } from 'react';
import { WebView } from 'react-native-webview';
import type { AndroidWebViewProps, IOSWebViewProps } from 'react-native-webview/lib/WebViewTypes';

// The package's platform-neutral declaration intersects incompatible Windows,
// Android and iOS props. Metro selects the actual native implementation at runtime.
export type WebViewHandle = { injectJavaScript: (script: string) => void };
type Props = IOSWebViewProps & Pick<AndroidWebViewProps, 'geolocationEnabled'> & RefAttributes<WebViewHandle>;
export const CompatibleWebView = WebView as unknown as ComponentType<Props>;
