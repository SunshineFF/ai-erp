import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { logout } from "./api";
import { BottomNavigation, AppHeader } from "./components/ScreenChrome";
import { useReferenceData } from "./hooks/useReferenceData";
import { useSession } from "./hooks/useSession";
import { HomeScreen } from "./screens/HomeScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { ProductionScreen } from "./screens/ProductionScreen";
import { PurchaseScreen } from "./screens/PurchaseScreen";
import { ShipmentScreen } from "./screens/ShipmentScreen";
import { FinanceScreen } from "./screens/FinanceScreen";
import { appStyles } from "./theme";
import type { ViewKey } from "./types";

const titles: Record<ViewKey, string> = { home: "现场作业", production: "生产订单录入", purchase: "采购单录入", shipment: "销售订单出库", finance: "财务记录" };

export function App() {
  const { user, completeLogin } = useSession();
  const { data: reference, error } = useReferenceData(Boolean(user));
  const [view, setView] = useState<ViewKey>("home");
  if (!user) return <LoginScreen onLogin={completeLogin} />;
  return <View style={appStyles.app}><AppHeader title={titles[view]} canGoBack={view !== "home"} onBack={() => setView("home")} onLogout={logout} /><ScrollView style={appStyles.screen} contentContainerStyle={appStyles.content}>{error && <View style={{ padding: 11, marginBottom: 12, borderWidth: 1, borderColor: "#f0c4bc", borderRadius: 7, backgroundColor: "#fff0ed" }}><Text style={{ color: "#a13325", fontSize: 13 }}>{error}</Text></View>}{view === "home" && <HomeScreen user={user} onOpen={setView} />}{view === "production" && <ProductionScreen reference={reference} />}{view === "purchase" && <PurchaseScreen reference={reference} />}{view === "shipment" && <ShipmentScreen reference={reference} />}{view === "finance" && <FinanceScreen />}</ScrollView><BottomNavigation selected={view} onChange={setView} /></View>;
}
