import { describe, it, expect } from 'vitest'
import { extractDomains } from './extractor.js'
import { ValidationError } from '../utils/errors.js'

describe('extractDomains', () => {
  it('extracts domain from pipe-separated email and password', () => {
    const input = 'user@example.com|password123'
    const result = extractDomains(input)
    expect(result.domains.has('example.com')).toBe(true)
    expect(result.domains.get('example.com')?.count).toBe(1)
    expect(result.totalEmails).toBe(1)
    expect(result.ignoredLines).toBe(0)
  })

  it('extracts domain from colon-separated email and password', () => {
    const input = 'admin@mycompany.org:secret_pass'
    const result = extractDomains(input)
    expect(result.domains.has('mycompany.org')).toBe(true)
    expect(result.totalEmails).toBe(1)
  })

  it('extracts domain from semicolon-separated email and password', () => {
    const input = 'test@domain.co.uk;somepassword'
    const result = extractDomains(input)
    expect(result.domains.has('domain.co.uk')).toBe(true)
    expect(result.totalEmails).toBe(1)
  })

  it('extracts multiple domains from mixed free-text input', () => {
    const input = `
      contact@alpha.com:pass1
      info@beta.io|pass2
      sales@gamma.net;pass3
    `
    const result = extractDomains(input)
    expect(result.domains.size).toBe(3)
    expect(result.domains.has('alpha.com')).toBe(true)
    expect(result.domains.has('beta.io')).toBe(true)
    expect(result.domains.has('gamma.net')).toBe(true)
    expect(result.totalEmails).toBe(3)
  })

  it('ignores lines without valid emails such as CSV headers', () => {
    const input = `email,password,notes\nuser@service.com,pass123,note`
    const result = extractDomains(input)
    expect(result.domains.size).toBe(1)
    expect(result.domains.has('service.com')).toBe(true)
    expect(result.ignoredLines).toBe(1)
  })

  it('deduplicates emails with the same root domain and aggregates count', () => {
    const input = `
      user1@example.com|pass1
      user2@example.com|pass2
      user3@example.com|pass3
    `
    const result = extractDomains(input)
    expect(result.domains.size).toBe(1)
    expect(result.domains.get('example.com')?.count).toBe(3)
    expect(result.totalEmails).toBe(3)
  })

  it('resolves subdomain emails to root domain and records subdomain info', () => {
    const input = 'billing@mail.sub.company.org|password'
    const result = extractDomains(input)
    expect(result.domains.has('company.org')).toBe(true)
    const entry = result.domains.get('company.org')
    expect(entry?.count).toBe(1)
    expect(entry?.subdomains.has('mail.sub.company.org')).toBe(true)
    expect(result.domains.has('mail.sub.company.org')).toBe(true)
    expect(result.domains.get('mail.sub.company.org')?.isSubdomain).toBe(true)
  })

  it('detects both subdomains and root domains from sample mixed data', () => {
    const input = `
      silu7544@sampaikan.biz.id | Pongsu50
      loyar6817@spcp.sampaikan.biz.id | Perli277
      wigata1697@a1npr21.sampaikan.biz.id | Rojol354
      kulot4212@7ghd.kualitas.biz.id | Nadi2002
      nazi9724@kualitas.biz.id | Hoki8929
    `
    const result = extractDomains(input)
    expect(result.domains.has('sampaikan.biz.id')).toBe(true)
    expect(result.domains.has('spcp.sampaikan.biz.id')).toBe(true)
    expect(result.domains.has('a1npr21.sampaikan.biz.id')).toBe(true)
    expect(result.domains.has('kualitas.biz.id')).toBe(true)
    expect(result.domains.has('7ghd.kualitas.biz.id')).toBe(true)

    expect(result.domains.get('spcp.sampaikan.biz.id')?.isSubdomain).toBe(true)
    expect(result.domains.get('spcp.sampaikan.biz.id')?.rootDomain).toBe('sampaikan.biz.id')
    expect(result.domains.get('7ghd.kualitas.biz.id')?.isSubdomain).toBe(true)
    expect(result.domains.get('7ghd.kualitas.biz.id')?.rootDomain).toBe('kualitas.biz.id')
  })

  it('extracts all subdomains from user sample data correctly', () => {
    const input = `
silu7544@sampaikan.biz.id | Pongsu50
kadim4041@sampaikan.biz.id | Kumpul76
panti6651@sampaikan.biz.id | Santam15
sosok2480@sampaikan.biz.id | Cuka4486
cecer9547@sampaikan.biz.id | Uwur4771
kibir785@sampaikan.biz.id | Kekang12
rema8875@sampaikan.biz.id | Kacer506
angga1539@sampaikan.biz.id | Cogok517
deting9472@sampaikan.biz.id | Jamhur23
keleti5616@sampaikan.biz.id | Emprak90
belik4554@sampaikan.biz.id | Vendor60
lapur9107@sampaikan.biz.id | Bebar825
loyar6817@spcp.sampaikan.biz.id | Perli277
tebus4036@sampaikan.biz.id | Pipet436
trap6163@sampaikan.biz.id | Serkup87
qasar4341@sampaikan.biz.id | Urian601
jeprat8957@sampaikan.biz.id | Kacang79
ruit4480@sampaikan.biz.id | Beloh978
kesup7809@sampaikan.biz.id | Encit841
alir1644@sampaikan.biz.id | Algoid79
durat971@sampaikan.biz.id | Mitos578
kapita2399@sampaikan.biz.id | Poma7659
wibawa9473@sampaikan.biz.id | Khalik70
botani6708@sampaikan.biz.id | Lister63
dange6220@sampaikan.biz.id | Hikmah50
gizi8532@sampaikan.biz.id | Sonder85
pana7237@sampaikan.biz.id | Kali0270
lewa2994@sampaikan.biz.id | Etiket93
vulger4082@sampaikan.biz.id | Jemawa77
kemala189@sampaikan.biz.id | Ungkul04
dingin268@sampaikan.biz.id | Kemit527
wira4485@sampaikan.biz.id | Wong6427
walah9590@sampaikan.biz.id | Alif2673
seman1511@sampaikan.biz.id | Reguk035
jantur7019@sampaikan.biz.id | Awah4927
paitua6658@sampaikan.biz.id | Somah069
gerdan9908@sampaikan.biz.id | Akor1256
rungut2110@sampaikan.biz.id | Pancal35
amulet1744@sampaikan.biz.id | Yang6401
perei48@sampaikan.biz.id | Runduk29
latuk9005@sampaikan.biz.id | Berapa02
cupai2256@sampaikan.biz.id | Aban5960
sosial812@sampaikan.biz.id | Balun713
folio2585@sampaikan.biz.id | Larah229
gepuk4355@sampaikan.biz.id | Mitasi97
sinus2259@sampaikan.biz.id | Abau5336
biliun7423@sampaikan.biz.id | Cunam317
resiko1707@sampaikan.biz.id | Incar619
kempis6081@sampaikan.biz.id | Akuk9636
gesel6054@sampaikan.biz.id | Rena3061
talib7835@sampaikan.biz.id | Kokila58
labres6100@sampaikan.biz.id | Stoker88
pipit2910@sampaikan.biz.id | Empos810
ulah154@sampaikan.biz.id | Sowang57
manut1768@sampaikan.biz.id | Silat607
smes8786@sampaikan.biz.id | Cadik662
purus6406@sampaikan.biz.id | Syajar34
simpuh9795@sampaikan.biz.id | Palai290
regi5296@sampaikan.biz.id | Bedeng16
tambak2967@sampaikan.biz.id | Lancit31
balkas6556@sampaikan.biz.id | Kabel366
mahraj1563@sampaikan.biz.id | Buldog25
libas236@sampaikan.biz.id | Lejang34
jemu4814@sampaikan.biz.id | Tuduh555
penyet2064@sampaikan.biz.id | Pampat61
ketam6826@sampaikan.biz.id | Biat7804
radin634@sampaikan.biz.id | Lantik09
adven9415@sampaikan.biz.id | Fiasko87
beskal3094@sampaikan.biz.id | Desih275
kaok8260@sampaikan.biz.id | Iler1920
bordil589@sampaikan.biz.id | Lokal038
astana3936@sampaikan.biz.id | Reca2789
serbat1343@sampaikan.biz.id | Suhad195
pandam2116@sampaikan.biz.id | Sampak16
ketip8394@sampaikan.biz.id | Derap705
kudup6436@sampaikan.biz.id | Liput554
miss7141@sampaikan.biz.id | Gaharu24
ramin4063@sampaikan.biz.id | Wukuf094
pitis7963@sampaikan.biz.id | Faktif36
pedak9734@sampaikan.biz.id | Loyang21
serse2615@sampaikan.biz.id | Logika97
kasiku5549@sampaikan.biz.id | Paltu439
kayai3184@sampaikan.biz.id | Suri1864
pampat1297@sampaikan.biz.id | Aung2612
utama860@sampaikan.biz.id | Klitik06
sarut3139@sampaikan.biz.id | Telaah03
wigata1697@a1npr21.sampaikan.biz.id | Rojol354
kulot4212@7ghd.kualitas.biz.id | Nadi2002
kutu2627@80z4.kualitas.biz.id | Buret210
durian2490@qao.kualitas.biz.id | Balot543
wigata5736@l52iqqe.kualitas.biz.id | Terbut36
bureng5552@d78.kualitas.biz.id | Cempe422
wahgs373@sampaikan.biz.id | Seturi33
sogok2520@sampaikan.biz.id | Alwah972
sepuh8470@7j26zxh.sampaikan.biz.id | Pendam08
pintan6599@mzoe.kualitas.biz.id | Kosbas73
nazi9724@kualitas.biz.id | Hoki8929
jirian2072@6gtxla.sampaikan.biz.id | Vakbon21
kokot1620@7qpb.sampaikan.biz.id | Jarah952
saat2878@u87.sampaikan.biz.id | Bisnis74
`
    const result = extractDomains(input)
    const expectedSubdomains = [
      'spcp.sampaikan.biz.id',
      'a1npr21.sampaikan.biz.id',
      '7ghd.kualitas.biz.id',
      '80z4.kualitas.biz.id',
      'qao.kualitas.biz.id',
      'l52iqqe.kualitas.biz.id',
      'd78.kualitas.biz.id',
      '7j26zxh.sampaikan.biz.id',
      'mzoe.kualitas.biz.id',
      '6gtxla.sampaikan.biz.id',
      '7qpb.sampaikan.biz.id',
      'u87.sampaikan.biz.id',
    ]
    for (const sub of expectedSubdomains) {
      expect(result.domains.has(sub)).toBe(true)
      expect(result.domains.get(sub)?.isSubdomain).toBe(true)
    }
    expect(result.domains.has('sampaikan.biz.id')).toBe(true)
    expect(result.domains.has('kualitas.biz.id')).toBe(true)
  })

  it('normalizes mixed case emails to lowercase', () => {
    const input = 'John.DOE@EXAMPLE.COM:Secret'
    const result = extractDomains(input)
    expect(result.domains.has('example.com')).toBe(true)
  })

  it('returns empty result for completely empty or whitespace input', () => {
    const result = extractDomains('   \n\n  \t  ')
    expect(result.domains.size).toBe(0)
    expect(result.totalEmails).toBe(0)
    expect(result.ignoredLines).toBe(0)
  })

  it('throws ValidationError when input exceeds line limits', () => {
    const manyLines = new Array(10002).fill('no-email-line').join('\n')
    expect(() => extractDomains(manyLines)).toThrow(ValidationError)
  })

  it('throws ValidationError when input exceeds byte limits', () => {
    const hugeInput = 'a'.repeat(513 * 1024)
    expect(() => extractDomains(hugeInput)).toThrow(ValidationError)
  })
})
