"use client"

import * as React from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme?: ResolvedTheme
  themes: Theme[]
}

export const THEME_STORAGE_KEY = "theme"

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyThemeClass(theme: Theme): ResolvedTheme {
  const resolved = theme === "system" ? getSystemTheme() : theme
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  return resolved
}

/** Inline FOUC-prevention script for Server Components (e.g. root layout `<head>`). */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var t=localStorage.getItem(k)||"system";var d=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var r=t==="system"?d:t;var e=document.documentElement;e.classList.remove("light","dark");e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("light")

  React.useEffect(() => {
    let stored: Theme = "system"
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY)
      if (value === "light" || value === "dark" || value === "system") {
        stored = value
      }
    } catch {
      // ignore
    }
    setThemeState(stored)
    setResolvedTheme(applyThemeClass(stored))

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      setThemeState((current) => {
        if (current === "system") {
          setResolvedTheme(applyThemeClass("system"))
        }
        return current
      })
    }
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // ignore
    }
    setResolvedTheme(applyThemeClass(next))
  }, [])

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        themes: ["light", "dark", "system"],
      }}
    >
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }
