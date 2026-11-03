import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { listZones } from '../../core/api/zones.js'
import { listDnsRecords, DnsRecord } from '../../core/api/dns.js'
import { extractDomains, ExtractResult } from '../../core/bulk/extractor.js'
import { matchDomains, MatchResult } from '../../core/bulk/matcher.js'
import { buildBundles, DomainBundle, MxEntry } from '../../core/bulk/bundle.js'
import { executeBulk, BulkSummary } from '../../core/bulk/orchestrator.js'
import { Spinner } from '../components/Spinner.js'
import { Toast } from '../components/Toast.js'
import { MultiSelect, MultiSelectOption } from '../components/MultiSelect.js'

interface BulkDnsProps {
  zoneId?: string
  apiToken: string
  onBack: () => void
}

type Step =
  | 'paste'
  | 'extract-preview'
  | 'bundle-select'
  | 'mx-input'
  | 'final-preview'
  | 'executing'
  | 'result'

export function BulkDns({ apiToken, onBack }: BulkDnsProps): React.ReactElement {
  const [step, setStep] = useState<Step>('paste')
  const [rawInput, setRawInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)

  const [bundleOptions, setBundleOptions] = useState<MultiSelectOption[]>([
    { label: 'MX Records', value: 'mx', checked: true },
    { label: 'SPF Record (v=spf1 mx ~all)', value: 'spf', checked: true },
    { label: 'DMARC Record (v=DMARC1; p=none)', value: 'dmarc', checked: true },
    { label: 'DKIM Record (default off)', value: 'dkim', checked: false },
  ])

  const [mxEntries, setMxEntries] = useState<MxEntry[]>([])
  const [selectedMxIndex, setSelectedMxIndex] = useState(0)
  const [mxHostInput, setMxHostInput] = useState('')
  const [mxPrioInput, setMxPrioInput] = useState('10')
  const [mxInputMode, setMxInputMode] = useState<'view' | 'add'>('view')

  const [bundles, setBundles] = useState<DomainBundle[]>([])
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null)

  useInput((input, key) => {
    if (loading) return

    if (key.escape) {
      if (step === 'paste') {
        onBack()
      } else if (step === 'extract-preview') {
        setStep('paste')
      } else if (step === 'bundle-select') {
        setStep('extract-preview')
      } else if (step === 'mx-input') {
        setStep('bundle-select')
      } else if (step === 'final-preview') {
        const isMx = bundleOptions.find((o) => o.value === 'mx')?.checked ?? false
        setStep(isMx ? 'mx-input' : 'bundle-select')
      } else if (step === 'result') {
        onBack()
      }
      return
    }

    if (step === 'paste') {
      if (key.return) {
        if (rawInput.trim().length === 0) {
          setToastMessage('Input is empty')
          return
        }
        void handleProcessInput()
        return
      }
      if (key.backspace || key.delete) {
        setRawInput((prev) => prev.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setRawInput((prev) => prev + input)
      }
      return
    }

    if (step === 'extract-preview') {
      if (key.return) {
        setStep('bundle-select')
      }
      return
    }

    if (step === 'mx-input') {
      if (mxInputMode === 'view') {
        if (key.upArrow) {
          setSelectedMxIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (key.downArrow) {
          setSelectedMxIndex((prev) => Math.min(Math.max(0, mxEntries.length - 1), prev + 1))
          return
        }
        if (input === 'a') {
          setMxInputMode('add')
          setMxHostInput('')
          setMxPrioInput('10')
          return
        }
        if (input === 'd' || key.delete) {
          if (mxEntries.length > 0) {
            setMxEntries((prev) => prev.filter((_, idx) => idx !== selectedMxIndex))
            setSelectedMxIndex((prev) => Math.max(0, prev - 1))
            setToastMessage('MX record berhasil dihapus')
          }
          return
        }
        if (input === 'c') {
          setMxEntries([])
          setSelectedMxIndex(0)
          setToastMessage('Semua MX record dihapus')
          return
        }
        if (key.return) {
          const isMx = bundleOptions.find((o) => o.value === 'mx')?.checked ?? false
          if (isMx && mxEntries.length === 0) {
            setToastMessage('Tambahkan minimal 1 MX host atau uncheck opsi MX')
            return
          }
          void handlePrepareBundles()
          return
        }
      } else {
        if (key.escape) {
          setMxInputMode('view')
          return
        }
        if (key.return) {
          const trimmed = mxHostInput.trim()
          if (trimmed.length > 0) {
            const parts = trimmed.split(/\s+/)
            let host = trimmed
            let priority = parseInt(mxPrioInput, 10) || 10
            if (parts.length >= 2 && /^\d+$/.test(parts[0]!)) {
              priority = parseInt(parts[0]!, 10)
              host = parts.slice(1).join(' ')
            }
            setMxEntries((prev) => [...prev, { host, priority }])
            setMxInputMode('view')
            setSelectedMxIndex(mxEntries.length)
          }
          return
        }
        if (key.backspace || key.delete) {
          setMxHostInput((prev) => prev.slice(0, -1))
          return
        }
        if (input && !key.ctrl && !key.meta) {
          setMxHostInput((prev) => prev + input)
        }
      }
      return
    }

    if (step === 'final-preview') {
      if (input === 'y' || input === 'Y' || key.return) {
        void handleExecute()
      }
      return
    }

    if (step === 'result') {
      if (key.return || input === 'q') {
        onBack()
      }
      return
    }
  })

  const handleProcessInput = async () => {
    try {
      setLoading(true)
      const extracted = extractDomains(rawInput)
      setExtractResult(extracted)

      const zones = await listZones(apiToken)
      const matched = matchDomains(extracted.domains, zones)
      setMatchResult(matched)

      setStep('extract-preview')
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePrepareBundles = async () => {
    if (!matchResult) return
    try {
      setLoading(true)
      const existingMap = new Map<string, DnsRecord[]>()
      for (const item of matchResult.matched) {
        const records = await listDnsRecords(apiToken, item.zoneId)
        existingMap.set(item.zoneId, records)
      }

      const isChecked = (val: string) =>
        bundleOptions.find((o) => o.value === val)?.checked ?? false

      const isMx = isChecked('mx')
      const built = await buildBundles(
        matchResult.matched,
        {
          mx: isMx && mxEntries.length > 0,
          spf: isChecked('spf'),
          dmarc: isChecked('dmarc'),
          dkim: isChecked('dkim'),
          mxEntries: isMx ? mxEntries : [],
        },
        existingMap,
      )

      setBundles(built)
      setStep('final-preview')
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Failed to prepare bundles')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    try {
      setStep('executing')
      setLoading(true)
      const summary = await executeBulk(bundles, apiToken, {
        dryRun: false,
        concurrency: 5,
      })
      setBulkSummary(summary)
      setStep('result')
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Execution failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          Bulk DNS Auto-Detect
        </Text>
        <Text dimColor>Step: {step}</Text>
      </Box>

      {toastMessage && (
        <Toast
          message={toastMessage}
          type="error"
          onDismiss={() => setToastMessage(null)}
        />
      )}

      {loading && <Spinner label="Processing bulk operation..." />}

      {step === 'paste' && !loading && (
        <Box flexDirection="column" gap={1}>
          <Text bold>Paste text with emails (e.g. email|pass, email:pass, csv):</Text>
          <Box borderStyle="round" borderColor="gray" padding={1} flexDirection="column">
            <Text color="cyan">{rawInput || '(Paste or type text, then press Enter to extract)'}</Text>
          </Box>
          <Text dimColor>Press Enter when done | Esc to cancel</Text>
        </Box>
      )}

      {step === 'extract-preview' && !loading && extractResult && matchResult && (
        <Box flexDirection="column" gap={1}>
          <Text bold color="green">
            Extracted {extractResult.domains.size} unique domain(s) from {extractResult.totalEmails} email(s)
          </Text>
          <Text dimColor>Ignored non-email lines: {extractResult.ignoredLines}</Text>

          <Box flexDirection="column">
            <Text bold color="cyan">Matched Zones ({matchResult.matched.length}):</Text>
            {matchResult.matched.map((m) => (
              <Text key={m.domain} color="green">  ✓ {m.domain} ({m.emailCount} emails) → Zone: {m.zoneName}</Text>
            ))}
          </Box>

          {matchResult.unmatched.length > 0 && (
            <Box flexDirection="column">
              <Text bold color="yellow">Unmatched Domains ({matchResult.unmatched.length}):</Text>
              {matchResult.unmatched.map((u) => (
                <Text key={u} color="yellow">  ✗ {u} (No matching Cloudflare zone found)</Text>
              ))}
            </Box>
          )}

          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <Text dimColor>Press Enter to continue to bundle selection | Esc to re-enter</Text>
          </Box>
        </Box>
      )}

      {step === 'bundle-select' && !loading && (
        <Box flexDirection="column" gap={1}>
          <Text bold>Select DNS Records to Provision:</Text>
          <MultiSelect
            options={bundleOptions}
            onChange={setBundleOptions}
            onSubmit={() => {
              const isMx = bundleOptions.find((o) => o.value === 'mx')?.checked ?? false
              if (isMx) {
                setStep('mx-input')
              } else {
                void handlePrepareBundles()
              }
            }}
          />
        </Box>
      )}

      {step === 'mx-input' && !loading && (
        <Box flexDirection="column" gap={1}>
          <Text bold>Configured MX Servers:</Text>
          {mxEntries.length === 0 ? (
            <Box borderStyle="round" borderColor="yellow" padding={1}>
              <Text color="yellow">Belum ada MX server yang dimasukkan. Tekan 'a' untuk menambahkan.</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              {mxEntries.map((mx, idx) => {
                const isSelected = idx === selectedMxIndex && mxInputMode === 'view'
                return (
                  <Box key={idx} gap={1}>
                    {isSelected ? <Text color="cyan" bold>▶</Text> : <Text>{' '}</Text>}
                    {isSelected ? (
                      <Text color="cyan" bold>
                        {idx + 1}. Host: {mx.host} (Priority: {mx.priority})
                      </Text>
                    ) : (
                      <Text>
                        {idx + 1}. Host: <Text color="cyan">{mx.host}</Text> (Priority: {mx.priority})
                      </Text>
                    )}
                  </Box>
                )
              })}
            </Box>
          )}

          {mxInputMode === 'add' ? (
            <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1} gap={1}>
              <Text bold color="cyan">Tambah MX Server:</Text>
              <Text dimColor>Format: "mail.myserver.com" atau "10 mail.myserver.com"</Text>
              <Box>
                <Text bold>{'> '}</Text>
                <Text color="cyan">{mxHostInput}</Text>
                <Text color="gray">_</Text>
              </Box>
              <Text dimColor>Tekan Enter untuk simpan | Esc untuk batal</Text>
            </Box>
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1}>
              <Text dimColor>
                'a' Tambah | 'd' Hapus | 'c' Hapus Semua | ↑/↓ Pilih | Enter Lanjut | Esc Kembali
              </Text>
            </Box>
          )}
        </Box>
      )}

      {step === 'final-preview' && !loading && (
        <Box flexDirection="column" gap={1}>
          <Text bold color="cyan">Execution Preview ({bundles.length} domains):</Text>
          {bundles.map((b) => (
            <Box key={b.domain} flexDirection="column" paddingLeft={1}>
              <Text bold color="green">Domain: {b.domain}</Text>
              {b.records.map((r, i) => (
                <Text key={i} dimColor>
                  [{r.action.toUpperCase()}] {r.type} {r.name} → {r.content} {r.priority ? `(${r.priority})` : ''}
                </Text>
              ))}
            </Box>
          ))}
          <Box borderStyle="single" borderColor="yellow" paddingX={1}>
            <Text bold color="yellow">Proceed with execution? Press Enter or 'y' | Esc to go back</Text>
          </Box>
        </Box>
      )}

      {step === 'result' && !loading && bulkSummary && (
        <Box flexDirection="column" gap={1}>
          <Text bold color="green">Bulk Execution Completed in {(bulkSummary.durationMs / 1000).toFixed(1)}s!</Text>
          <Text>
            Matched: {bulkSummary.matched} | Created: {bulkSummary.created} | Skipped: {bulkSummary.skipped} | Replaced: {bulkSummary.replaced} | Errors: {bulkSummary.errors}
          </Text>

          <Box flexDirection="column" gap={1}>
            {bulkSummary.domainResults.map((dr) => (
              <Box key={dr.domain} flexDirection="column" paddingLeft={1}>
                <Text bold>{dr.domain}:</Text>
                {dr.records.map((rec, i) => (
                  <Text key={i} color={rec.status === 'error' ? 'red' : rec.status === 'created' ? 'green' : 'gray'}>
                    {rec.status === 'error' ? '✗' : '✓'} {rec.type} {rec.name} → {rec.status} {rec.error ? `(${rec.error})` : ''}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>

          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <Text dimColor>Press Enter or Esc to return to menu</Text>
          </Box>
        </Box>
      )}
    </Box>
  )
}

