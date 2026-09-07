"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  isDark: boolean;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  isDark: false,
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "refine-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (typeof window !== "undefined" ? (localStorage.getItem(storageKey) as Theme) : null) || defaultTheme
  );

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const updateSystem = () => {
        setSystemIsDark(media.matches);
        root.classList.remove("light", "dark");
        root.classList.add(media.matches ? "dark" : "light");
      };
      updateSystem();
      media.addEventListener("change", updateSystem);
      return () => media.removeEventListener("change", updateSystem);
    }

    root.classList.add(theme);
  }, [theme]);

  const resolvedTheme: "dark" | "light" = theme === "system" ? (systemIsDark ? "dark" : "light") : theme;
  const isDark = resolvedTheme === "dark";

  const value = {
    theme,
    resolvedTheme,
    isDark,
    setTheme: (newTheme: Theme) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, newTheme);
      }
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) {
    console.error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

ThemeProvider.displayName = "ThemeProvider";
