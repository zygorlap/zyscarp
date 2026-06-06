import fs from 'fs';
import path from 'path';

export class SecretExtractor {
  constructor() {
    this.secrets = [];
    this.patterns = {
      aws: [
        { regex: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key' },
        { regex: /aws_access_key_id\s*=\s*[A-Za-z0-9/+=]{20,}/g, name: 'AWS Key ID' },
        { regex: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40,}/g, name: 'AWS Secret Key' }
      ],
      api_keys: [
        { regex: /api[_-]?key\s*[=:]\s*['"]?([A-Za-z0-9_\-]{16,})['"]?/gi, name: 'API Key' },
        { regex: /apikey\s*[=:]\s*['"]?([A-Za-z0-9_\-]{16,})['"]?/gi, name: 'API Key Compact' },
        { regex: /sk[_-]?live[_-]?[a-zA-Z0-9]{20,}/g, name: 'Stripe Key' },
        { regex: /pk[_-]?live[_-]?[a-zA-Z0-9]{20,}/g, name: 'Stripe Public Key' }
      ],
      tokens: [
        { regex: /bearer\s+[A-Za-z0-9\-._~+/]{20,}/gi, name: 'Bearer Token' },
        { regex: /token\s*[=:]\s*['"]?([A-Za-z0-9_\-.]{20,})['"]?/gi, name: 'Token' },
        { regex: /access[_-]?token\s*[=:]\s*['"]?([A-Za-z0-9_\-.]{20,})['"]?/gi, name: 'Access Token' }
      ],
      jwt: [
        { regex: /eyJ[A-Za-z0-9_\-.]+\.eyJ[A-Za-z0-9_\-.]+\.[A-Za-z0-9_\-.]+/g, name: 'JWT Token' }
      ],
      github: [
        { regex: /ghp_[A-Za-z0-9]{36}/g, name: 'GitHub PAT' },
        { regex: /ghu_[A-Za-z0-9]{36}/g, name: 'GitHub User Token' },
        { regex: /ghs_[A-Za-z0-9]{36}/g, name: 'GitHub Refresh Token' },
        { regex: /gho_[A-Za-z0-9]{36}/g, name: 'GitHub OAuth Token' },
        { regex: /github_pat_[A-Za-z0-9_]{22,}/g, name: 'GitHub Fine-grained PAT' }
      ],
      google: [
        { regex: /AIza[0-9A-Za-z\-_]{35}/g, name: 'Google API Key' },
        { regex: /GOCSPX[0-9A-Za-z\-_]{20}/g, name: 'Google OAuth Key' }
      ],
      private_keys: [
        { regex: /-----BEGIN (RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----[\s\S]*?-----END \1 PRIVATE KEY-----/g, name: 'Private Key' },
        { regex: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, name: 'Private Key PKCS8' }
      ],
      passwords: [
        { regex: /password\s*[=:]\s*['"]?([^'"\s]{6,})['"]?/gi, name: 'Password' },
        { regex: /passwd\s*[=:]\s*['"]?([^'"\s]{6,})['"]?/gi, name: 'Passwd' }
      ],
      database: [
        { regex: /mongodb(\+srv)?:\/\/[^\s'"]+/g, name: 'MongoDB URI' },
        { regex: /postgres(ql)?:\/\/[^\s'"]+/g, name: 'PostgreSQL URI' },
        { regex: /mysql:\/\/[^\s'"]+/g, name: 'MySQL URI' },
        { regex: /redis:\/\/[^\s'"]+/g, name: 'Redis URI' }
      ],
      slack: [
        { regex: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{24,28}/g, name: 'Slack Bot Token' },
        { regex: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[A-Za-z0-9]{32}/g, name: 'Slack User Token' }
      ],
      discord: [
        { regex: /[MN][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/g, name: 'Discord Bot Token' }
      ],
      openai: [
        { regex: /sk-[A-Za-z0-9]{20,}/g, name: 'OpenAI Key' }
      ],
      twilio: [
        { regex: /SK[0-9a-fA-F]{32}/g, name: 'Twilio API Key' }
      ]
    };
  }

  extract(content, filename = '') {
    const detected = [];
    for (const [category, patternList] of Object.entries(this.patterns)) {
      for (const { regex, name } of patternList) {
        const re = new RegExp(regex.source, regex.flags);
        let match;
        while ((match = re.exec(content)) !== null) {
          const secret = {
            type: category,
            name,
            value: this.obfuscate(match[0]),
            length: match[0].length,
            source: filename,
            severity: this.calculateSeverity(category),
            confidence: this.calculateConfidence(category),
            timestamp: new Date().toISOString()
          };
          detected.push(secret);
          this.secrets.push(secret);
        }
      }
    }
    return detected;
  }

  scanMirror(manifest, outputDir) {
    if (!manifest?.files) return [];
    const textExts = ['.html', '.htm', '.js', '.mjs', '.json', '.css', '.php', '.sql', '.txt', '.env', '.xml', '.yaml', '.yml'];
    for (const file of manifest.files) {
      const ext = path.extname(file.local).toLowerCase();
      if (!textExts.includes(ext)) continue;
      const fullPath = path.join(outputDir, file.local);
      if (!fs.existsSync(fullPath)) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        this.extract(content, file.url);
      } catch {}
    }
    return this.secrets;
  }

  obfuscate(value) {
    if (value.length <= 10) return '***';
    return value.substring(0, 5) + '***' + value.substring(value.length - 3);
  }

  calculateSeverity(category) {
    const map = {
      private_keys: 'CRITICAL', aws: 'CRITICAL', github: 'CRITICAL',
      database: 'CRITICAL', passwords: 'CRITICAL',
      jwt: 'HIGH', api_keys: 'HIGH', tokens: 'HIGH', google: 'HIGH',
      slack: 'HIGH', discord: 'HIGH', openai: 'HIGH', twilio: 'HIGH',
      credentials: 'MEDIUM'
    };
    return map[category] || 'LOW';
  }

  calculateConfidence(category) {
    const map = {
      private_keys: 99, aws: 95, jwt: 90, github: 95, database: 85,
      api_keys: 70, tokens: 75, passwords: 50, openai: 80
    };
    return map[category] || 60;
  }

  getReport() {
    return {
      totalSecrets: this.secrets.length,
      bySeverity: {
        CRITICAL: this.secrets.filter(s => s.severity === 'CRITICAL').length,
        HIGH: this.secrets.filter(s => s.severity === 'HIGH').length,
        MEDIUM: this.secrets.filter(s => s.severity === 'MEDIUM').length,
        LOW: this.secrets.filter(s => s.severity === 'LOW').length
      },
      byType: this.groupBy(this.secrets, 'type'),
      secrets: [...this.secrets].sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.severity] - order[b.severity];
      })
    };
  }

  groupBy(array, key) {
    return array.reduce((acc, obj) => {
      acc[obj[key]] = (acc[obj[key]] || 0) + 1;
      return acc;
    }, {});
  }
}

export default SecretExtractor;
