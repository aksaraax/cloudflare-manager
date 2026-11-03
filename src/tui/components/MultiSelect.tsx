import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export interface MultiSelectOption {
  label: string
  value: string
  checked: boolean
}

interface MultiSelectProps {
  options: MultiSelectOption[]
  onChange: (options: MultiSelectOption[]) => void
  onSubmit: (selected: MultiSelectOption[]) => void
}

export function MultiSelect({ options, onChange, onSubmit }: MultiSelectProps): React.ReactElement {
  const [cursor, setCursor] = useState(0)

  useInput((_input, key) => {
    if (key.upArrow) {
      setCursor((prev) => Math.max(0, prev - 1))
    } else if (key.downArrow) {
      setCursor((prev) => Math.min(options.length - 1, prev + 1))
    } else if (key.return) {
      onSubmit(options.filter((o) => o.checked))
    } else if (_input === ' ') {
      const updated = options.map((o, i) =>
        i === cursor ? { ...o, checked: !o.checked } : o
      )
      onChange(updated)
    }
  })

  return (
    <Box flexDirection="column">
      <Text dimColor>↑↓ navigate · Space toggle · Enter submit</Text>
      {options.map((option, i) => (
        <Box key={option.value} gap={1}>
          {i === cursor ? <Text color="cyan">▶</Text> : <Text> </Text>}
          {option.checked ? <Text color="green">☑</Text> : <Text>☐</Text>}
          {i === cursor ? <Text color="cyan">{option.label}</Text> : <Text>{option.label}</Text>}
        </Box>
      ))}
    </Box>
  )
}
