import { theme } from "./theme";

export const ui = {
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  screenSection: {
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radiusLg,
    padding: 16,
    ...theme.elevation.subtle,
  },
  screenPadded: {
    flex: 1,
    padding: 24,
    backgroundColor: theme.colors.bg,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: theme.radiusSm,
    padding: 12,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  inputFocused: {
    borderColor: theme.colors.focusRing,
  },
  button: {
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radiusSm,
    alignItems: "center",
    backgroundColor: theme.colors.surface1,
  },
  buttonPrimary: {
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radiusSm,
    alignItems: "center",
    backgroundColor: theme.colors.primary,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  mutedPanel: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface2,
    padding: 12,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface1,
  },
  cardElevated: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface1,
    ...theme.elevation.card,
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface2,
  },
} as const;
