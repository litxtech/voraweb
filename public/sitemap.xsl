<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html>
      <head>
        <meta charset="utf-8"/>
        <title>Sitemap</title>
        <style>
          body { font-family: sans-serif; background: #0b1220; color: #f4f7fb; margin: 0; }
          main { max-width: 880px; margin: 0 auto; padding: 32px 16px 64px; }
          h1 { font-size: 28px; margin: 0 0 8px; }
          p { color: #9aa8bc; }
          ol { padding: 0; margin: 24px 0 0; list-style: none; }
          li { border-top: 1px solid #2a3444; }
          a { display: block; color: #8ec5ff; text-decoration: none; padding: 12px 0; word-break: break-all; }
        </style>
      </head>
      <body>
        <main>
          <h1>Sitemap</h1>
          <p><xsl:value-of select="count(//s:loc)"/> adres</p>
          <ol>
            <xsl:for-each select="//s:loc">
              <li><a href="{.}"><xsl:value-of select="."/></a></li>
            </xsl:for-each>
          </ol>
        </main>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
