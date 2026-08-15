import React from "react";
import { View as WebView } from "react-native-web";

export * from "react-native-web";

export const View = React.forwardRef<unknown, React.ComponentProps<typeof WebView>>(({ children, ...props }, ref) => {
  const normalizedChildren = React.Children.toArray(children).filter((child) => typeof child !== "string" || child.trim().length > 0);
  return <WebView {...props} ref={ref as never}>{normalizedChildren}</WebView>;
});

View.displayName = "View";
