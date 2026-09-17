import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, color, font, modernBg } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors so a single broken screen doesn't blank the whole app.
 *  Retrying re-mounts the tree, which is enough for transient failures. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Swap for a crash reporter (e.g. Sentry) once one is set up.
    console.error('Unhandled render error', error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>The screen stopped responding. Try again, and reload the app if it keeps happening.</Text>
          <Text style={styles.detail} numberOfLines={3}>
            {error.message}
          </Text>
          <Pressable onPress={this.retry} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: modernBg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
  },
  title: { fontFamily: font.headingBold, fontWeight: '700', fontSize: 22, letterSpacing: -0.2, color: color.text },
  body: { fontSize: 13.5, lineHeight: 20, color: alpha(color.text, 60) },
  detail: { fontSize: 11.5, lineHeight: 16, color: alpha(color.text, 45) },
  button: { marginTop: 4, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: color.accent },
  buttonText: { fontFamily: font.bodySemiBold, fontSize: 14, color: '#ffffff' },
});
