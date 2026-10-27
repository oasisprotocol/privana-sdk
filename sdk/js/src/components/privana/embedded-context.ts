import { createContext, useContext } from 'react'

// True when a flow renders inside a host page that brings its own header and background.
export const EmbeddedContext = createContext(false)

export const useEmbedded = () => useContext(EmbeddedContext)

export const FLOW_PANEL_CLASS = 'bg-muted rounded-[10px] p-5'
