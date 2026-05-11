import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { NetworkProvider } from "./context/NetworkContext";
import { ThemeProvider } from "./context/ThemeContext";
import { registerSyncListeners } from "./lib/syncQueue";
import { PrivateRoute, AdminRoute } from "./app/PrivateRoute";
import App from "./app/App";
import LoginPage from "./app/LoginPage";
import AdminLayout from "./app/pages/AdminLayout";
import UsersPage from "./app/pages/admin/UsersPage";
import GroupsPage from "./app/pages/admin/GroupsPage";
import "./lib/i18n";
import "./styles/index.css";

registerSyncListeners();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <ThemeProvider>
    <NetworkProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
          </Route>

          {}
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <App />
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </NetworkProvider>
    </ThemeProvider>
  </BrowserRouter>
);
