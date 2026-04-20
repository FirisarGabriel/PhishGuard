import { theme } from "./theme";

export const ui = {
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
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
    borderRadius: theme.radius,
    padding: 12,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  button: {
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    alignItems: "center",
    backgroundColor: theme.colors.card,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
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
    backgroundColor: theme.colors.card,
  },
} as const;
