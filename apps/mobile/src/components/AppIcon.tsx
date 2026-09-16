import React from "react";
import {
  Boxes,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Check,
  ClipboardList,
  House,
  LogOut,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Upload,
  UserRound,
  WalletCards,
} from "lucide-react";

export type AppIconName =
  | "app"
  | "attachment"
  | "back"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "home"
  | "logout"
  | "production"
  | "purchase"
  | "shipment"
  | "plus"
  | "refresh"
  | "trash"
  | "upload"
  | "user"
  | "finance";

const icons = {
  app: Boxes,
  attachment: Paperclip,
  back: ChevronLeft,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  home: House,
  logout: LogOut,
  production: ClipboardList,
  purchase: ShoppingCart,
  shipment: PackageCheck,
  plus: Plus,
  refresh: RefreshCw,
  trash: Trash2,
  upload: Upload,
  user: UserRound,
  finance: WalletCards,
};

export function AppIcon({ name, size = 20, color = "currentColor" }: { name: AppIconName; size?: number; color?: string }) {
  const Icon = icons[name] as unknown as React.ComponentType<{ "aria-hidden"?: boolean | "true" | "false"; color?: string; size?: number; strokeWidth?: number }>;
  return <Icon aria-hidden="true" color={color} size={size} strokeWidth={2} />;
}
