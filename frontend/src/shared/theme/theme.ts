import { createTheme } from '@mui/material/styles'

// Tema de VozMuni (SPEC 44): moderno y cálido, índigo de principal y coral de acento.
// Es el único lugar con colores: los componentes usan los del tema, nunca un color fijo.
// El coral no se usa como color de texto pequeño sobre fondo claro (no llega a 4.5:1).

// Clave de localStorage donde MUI guarda el modo elegido: 'light', 'dark' o 'system'.
// index.html la lee antes del primer pintado para no mostrar el modo equivocado.
export const CLAVE_MODO = 'vozmuni.tema'

const TINTA = '#1E1B2E' // texto oscuro sobre fondos claros o coral

export const theme = createTheme({
  // Clases .light / .dark en <html>: las pone el script de index.html y luego MUI.
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#4F46E5', light: '#818CF8', dark: '#3730A3', contrastText: '#FFFFFF' },
        secondary: { main: '#F26B5B', light: '#FF9B8F', dark: '#C2483B', contrastText: TINTA },
        background: { default: '#FBF8F4', paper: '#FFFFFF' },
        text: { primary: TINTA, secondary: '#5B5770' },
        divider: '#ECE6DE',
      },
    },
    dark: {
      palette: {
        primary: { main: '#A5B4FC', light: '#C7D2FE', dark: '#818CF8', contrastText: TINTA },
        secondary: { main: '#FF9B8F', light: '#FFC2BA', dark: '#F26B5B', contrastText: TINTA },
        background: { default: '#14131F', paper: '#1E1D2B' },
        text: { primary: '#F4F2FA', secondary: '#B9B5CC' },
        divider: '#2E2C40',
      },
    },
  },
  typography: {
    fontFamily: '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 800 },
    h3: { fontWeight: 800 },
    h4: { fontWeight: 800 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, paddingInline: 18 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: 16 },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { borderRadius: 16 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 10,
          backgroundColor: theme.vars.palette.background.paper,
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
      },
    },
    // Barra clara con borde inferior, en lugar del bloque de color de MUI.
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.vars.palette.background.paper,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
        }),
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: theme.vars.palette.background.paper,
          borderRight: `1px solid ${theme.vars.palette.divider}`,
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 10,
          marginInline: theme.spacing(1),
          '&.Mui-selected, &[aria-current="page"]': {
            backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
            color: theme.vars.palette.primary.main,
            fontWeight: 700,
          },
        }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 12 },
      },
    },
  },
})
