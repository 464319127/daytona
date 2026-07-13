/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { format, subDays, subHours, subMinutes } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { DateRange } from 'react-day-picker'

// Simple configuration object
export interface QuickRangesConfig {
  minutes?: number[]
  hours?: number[]
  days?: number[]
  months?: number[]
  years?: number[]
}

const createTimeRangesFromConfig = (config: QuickRangesConfig) => {
  const ranges: Array<{ label: string; getRange: () => DateRange }> = []

  // Generate ranges from config
  for (const unit in config) {
    const values = config[unit as keyof QuickRangesConfig]
    if (!values || !Array.isArray(values)) continue

    values.forEach((value) => {
      const unitLabel = value === 1 ? unit.slice(0, -1) : unit // Remove 's' for singular
      ranges.push({
        label: `Last ${value} ${unitLabel}`,
        getRange: () => {
          const now = new Date()
          switch (unit) {
            case 'minutes':
              return { from: subMinutes(now, value), to: now }
            case 'hours':
              return { from: subHours(now, value), to: now }
            case 'days':
              return { from: subDays(now, value), to: now }
            case 'months':
              return { from: subDays(now, value * 30), to: now }
            case 'years':
              return { from: subDays(now, value * 365), to: now }
            default:
              return { from: now, to: now }
          }
        },
      })
    })
  }

  return ranges
}

const getQuickRangeDisplayLabel = (label: string) => {
  if (label === 'All time') return '全部时间'

  const match = label.match(/^Last (\d+) (minute|minutes|hour|hours|day|days|month|months|year|years)$/)
  if (!match) return label

  const unitLabels: Record<string, string> = {
    minute: '分钟',
    minutes: '分钟',
    hour: '小时',
    hours: '小时',
    day: '天',
    days: '天',
    month: '个月',
    months: '个月',
    year: '年',
    years: '年',
  }
  return `最近 ${match[1]} ${unitLabels[match[2]]}`
}

export interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange) => void
  quickRangesEnabled?: boolean
  quickRanges?: QuickRangesConfig
  className?: string
  timeSelection?: boolean
  disabled?: boolean
  defaultSelectedQuickRange?: string
  selectedQuickRange?: string | null
  contentAlign?: 'start' | 'end'
}

export interface DateRangePickerRef {
  getCurrentRange: () => DateRange
}

function formatTime(date: Date) {
  return format(date, 'HH:mm:ss')
}

function rangesMatch(left: DateRange, right: DateRange, toleranceMs = 60_000) {
  if (!left.from && !left.to && !right.from && !right.to) {
    return true
  }

  if (!left.from || !left.to || !right.from || !right.to) {
    return false
  }

  return (
    Math.abs(left.from.getTime() - right.from.getTime()) <= toleranceMs &&
    Math.abs(left.to.getTime() - right.to.getTime()) <= toleranceMs
  )
}

export const DateRangePicker = forwardRef<DateRangePickerRef, DateRangePickerProps>(
  (
    {
      value,
      onChange,
      quickRangesEnabled = false,
      quickRanges = {},
      className,
      timeSelection = true,
      disabled = false,
      defaultSelectedQuickRange,
      selectedQuickRange: controlledSelectedQuickRange,
      contentAlign = 'start',
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedQuickRange, setSelectedQuickRange] = useState<string | null>(
      controlledSelectedQuickRange ?? defaultSelectedQuickRange ?? null,
    )
    const [fromTime, setFromTime] = useState<string>(() => (value?.from ? formatTime(value.from) : '00:00:00'))
    const [toTime, setToTime] = useState<string>(() => (value?.to ? formatTime(value.to) : '23:59:59'))
    const selectedQuickRangeRef = useRef(selectedQuickRange)

    // Internal state to track the current selection for preview
    const [internalRange, setInternalRange] = useState<DateRange>(value || { from: undefined, to: undefined })

    useEffect(() => {
      selectedQuickRangeRef.current = selectedQuickRange
    }, [selectedQuickRange])

    useEffect(() => {
      if (controlledSelectedQuickRange !== undefined) {
        setSelectedQuickRange(controlledSelectedQuickRange)
      }
    }, [controlledSelectedQuickRange])

    // Expose methods to parent component
    useImperativeHandle(
      ref,
      () => ({
        getCurrentRange: (): DateRange => {
          // Always return fresh range for relative selections
          if (selectedQuickRange && selectedQuickRange !== 'All time') {
            const matchingRange = createTimeRangesFromConfig(quickRanges).find(
              (timeRange) => timeRange.label === selectedQuickRange,
            )
            if (matchingRange) {
              return matchingRange.getRange() // Fresh timestamps every time!
            }
          }
          // For custom ranges or "All time", return the current value
          return value || { from: undefined, to: undefined }
        },
      }),
      [selectedQuickRange, quickRanges, value],
    )

    // Sync internal state when parent value changes
    useEffect(() => {
      const nextRange = value || { from: undefined, to: undefined }

      setInternalRange(nextRange)

      if (value?.from) {
        setFromTime(formatTime(value.from))
      }

      if (value?.to) {
        setToTime(formatTime(value.to))
      }

      const currentSelectedQuickRange = selectedQuickRangeRef.current

      if (!currentSelectedQuickRange) {
        return
      }

      if (currentSelectedQuickRange === 'All time') {
        if (nextRange.from || nextRange.to) {
          setSelectedQuickRange(null)
        }
        return
      }

      const matchingRange = createTimeRangesFromConfig(quickRanges).find(
        (timeRange) => timeRange.label === currentSelectedQuickRange,
      )

      if (!matchingRange || !rangesMatch(nextRange, matchingRange.getRange())) {
        setSelectedQuickRange(null)
      }
    }, [quickRanges, value])

    const handleQuickRangeSelect = (range: DateRange, label: string) => {
      setSelectedQuickRange(label)
      setInternalRange(range) // Update internal state for preview
      onChange?.(range) // Notify parent immediately
      setIsOpen(false)
    }

    const handleCustomRangeChange = (range: DateRange | undefined) => {
      if (range) {
        setSelectedQuickRange(null) // Clear quick range when using custom
        setInternalRange(range) // Update internal state for preview
        // Removed onChange call - only apply when button is clicked
      }
    }

    const handleTimeChange = (time: string, isFrom: boolean) => {
      if (isFrom) {
        setFromTime(time)
      } else {
        setToTime(time)
      }

      // Removed immediate application - only apply when button is clicked
      // Time changes are now stored in state but not sent to parent until Apply is clicked
    }

    const formatRange = (range: DateRange) => {
      // If a quick range is selected, show its label
      if (selectedQuickRange) return getQuickRangeDisplayLabel(selectedQuickRange)

      // Check if this is "All time" (no date restriction)
      if (!range.from && !range.to) return '选择日期范围'

      // Helper function to format a date with or without time
      const formatDate = (date: Date) => {
        if (timeSelection) {
          return `${format(date, 'PPP', { locale: zhCN })}, ${fromTime}`
        }
        return format(date, 'PPP', { locale: zhCN })
      }

      // Show custom date range with or without time
      if (range.from && range.to) {
        if (timeSelection) {
          // For custom ranges with time, show the actual time that will be applied
          return `${format(range.from, 'PPP', { locale: zhCN })}, ${fromTime} - ${format(range.to, 'PPP', { locale: zhCN })}, ${toTime}`
        }
        return `${format(range.from, 'PPP', { locale: zhCN })} - ${format(range.to, 'PPP', { locale: zhCN })}`
      } else if (range.from) {
        return `${formatDate(range.from)} - ...`
      }

      return '选择日期范围'
    }

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'flex w-full justify-between text-left font-normal hover:bg-background',
              !internalRange?.from && 'text-muted-foreground',
              className,
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              {internalRange?.from ? formatRange(internalRange) : <span>选择日期范围</span>}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align={contentAlign}>
          <div className="flex">
            {/* Quick ranges panel */}
            {quickRangesEnabled && (
              <div className="w-64 p-4 border-r">
                <div className="text-sm font-medium mb-3 text-center">快捷范围</div>
                <div className="space-y-1 max-h-[400px] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <button
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                      selectedQuickRange === 'All time' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )}
                    onClick={() => handleQuickRangeSelect({ from: undefined, to: undefined }, 'All time')}
                  >
                    全部时间
                  </button>
                  {createTimeRangesFromConfig(quickRanges || {}).map((timeRange) => (
                    <button
                      key={timeRange.label}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                        selectedQuickRange === timeRange.label
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                      onClick={() => handleQuickRangeSelect(timeRange.getRange(), timeRange.label)}
                    >
                      {getQuickRangeDisplayLabel(timeRange.label)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom range panel */}
            <div className="w-auto p-4">
              <h3 className="font-semibold text-sm mb-3 text-center">自定义范围</h3>
              {/* <p className="text-xs text-muted-foreground mb-4">
              Click and drag to select a date range, or click two dates
            </p> */}

              <div className="w-fit mx-auto">
                <Calendar
                  mode="range"
                  selected={internalRange}
                  onSelect={handleCustomRangeChange}
                  numberOfMonths={1}
                  disabled={{ after: new Date() }}
                />
              </div>

              {/* Time selection */}
              {timeSelection && (
                <div className="mt-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="w-8 text-sm font-medium text-foreground text-left">从</label>
                      <Input
                        type="time"
                        value={fromTime}
                        onChange={(e) => handleTimeChange(e.target.value, true)}
                        step="1"
                        className="w-2/3"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="w-8 text-sm font-medium text-foreground text-left">至</label>
                      <Input
                        type="time"
                        value={toTime}
                        onChange={(e) => handleTimeChange(e.target.value, false)}
                        step="1"
                        className="w-2/3"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-center mt-4">
                <Button
                  variant="default"
                  size="sm"
                  className="w-auto px-4"
                  onClick={() => {
                    const applyTimeToDate = (date: Date, timeStr: string) => {
                      const [hours, minutes, seconds] = timeStr.split(':').map((str) => parseInt(str, 10))
                      return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds || 0)
                    }
                    const finalRange: DateRange = {
                      from: applyTimeToDate(internalRange.from || new Date(), fromTime),
                      to: applyTimeToDate(internalRange.to || new Date(), toTime),
                    }
                    onChange?.(finalRange)
                    setIsOpen(false)
                  }}
                >
                  应用时间范围
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  },
)
