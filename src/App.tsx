import React from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { Home } from "./pages/Home";
import "./App.css";

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
