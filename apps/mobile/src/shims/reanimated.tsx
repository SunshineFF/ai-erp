import React from "react";
import { View } from "react-native";

type SharedValue<T> = { value: T };

export const useSharedValue = <T,>(value: T): SharedValue<T> => ({ value });
export const useDerivedValue = <T,>(factory: () => T): SharedValue<T> => ({ value: factory() });
export const useAnimatedStyle = (factory: () => unknown): unknown => factory();
export const useAnimatedReaction = () => undefined;
export const useFrameCallback = () => ({ setActive: () => undefined });
export const runOnJS = <T extends (...args: any[]) => any>(callback: T) => callback;
export const withTiming = <T,>(value: T) => value;
export const withSpring = <T,>(value: T) => value;

const ReanimatedView = React.forwardRef((props: React.ComponentProps<typeof View>, ref: React.Ref<unknown>) => <View {...props} ref={ref as any} />);
ReanimatedView.displayName = "ReanimatedView";
export default { View: ReanimatedView };
