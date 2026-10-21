import Document, { type DocumentContext, type DocumentInitialProps, Head, Html, Main, NextScript } from "next/document";

type Props = DocumentInitialProps & { nonce?: string };

/**
 * Passes this page view's nonce (set by src/proxy.ts) to Next.js's tags, so
 * they run under the strict Content Security Policy.
 */
export default class PikvaDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initialProps = await Document.getInitialProps(ctx);
    const nonce = ctx.req?.headers?.["x-nonce"];
    return { ...initialProps, nonce: typeof nonce === "string" ? nonce : undefined };
  }

  render() {
    const { nonce } = this.props;
    return (
      <Html lang="en">
        <Head nonce={nonce}>
          <link rel="icon" href="/favicon.ico" sizes="48x48" />
          <link rel="icon" href="/icon.png" type="image/png" sizes="512x512" />
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
          {/* Lets a phone add Pikva to the Home Screen; iPhones only allow push notifications from there. */}
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="apple-mobile-web-app-title" content="Pikva" />
          <meta name="theme-color" content="#5b3bd6" />
        </Head>
        <body className="antialiased">
          <Main />
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
