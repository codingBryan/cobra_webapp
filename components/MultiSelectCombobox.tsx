"use client"

import * as React from "react"
import { Check, X, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils" // Assuming you have this from shadcn
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"

// -----------------------------------------------------------------------------
// 1. The Reusable Multi-Select Component
// -----------------------------------------------------------------------------

// Define the props for the component
interface MultiSelectComboboxProps {
  /** The full list of items to search from. */
  items: string[];
  /** The currently selected items. */
  selectedItems: string[];
  /** Callback function to update the parent state with the new list of selected items. */
  setSelectedItems: (items: string[]) => void;
  /** Placeholder text for the trigger button when no items are selected. */
  placeholder?: string;
  /** Placeholder text for the search input inside the popover. */
  searchPlaceholder?: string;
  /** A class name to apply to the main wrapper for custom styling. */
  className?: string;
}

/**
 * A multi-select combobox with search, selection badges, and a popover list.
 * It is a controlled component, managing selection state via `selectedItems` and `setSelectedItems` props.
 */
export function MultiSelectCombobox({
  items,
  selectedItems,
  setSelectedItems,
  placeholder = "Select items...",
  searchPlaceholder = "Search...",
  className,
}: MultiSelectComboboxProps) {
  
  // State for the popover's open/closed status
  const [isOpen, setIsOpen] = React.useState(false)
  
  // State for the search input value
  const [searchValue, setSearchValue] = React.useState("")

  /**
   * Toggles the selection of an item.
   * Adds it to the list if not selected, removes it if it is.
   * @param item The string item to toggle.
   */
  const toggleItem = (item: string) => {
    let newSelection: string[]
    if (selectedItems.includes(item)) {
      // Filter out the item
      newSelection = selectedItems.filter((s) => s !== item)
    } else {
      // Add the new item
      newSelection = [...selectedItems, item]
    }
    // Update the parent state
    setSelectedItems(newSelection)
  }

  /**
   * Handles the 'X' button click on a badge to deselect an item.
   * We must stop propagation to prevent the popover trigger from firing.
   * @param e The mouse event.
   * @param item The string item to deselect.
   */
  const handleDeselect = (
    e: React.MouseEvent<HTMLElement>,
    item: string
  ) => {
    e.stopPropagation() // Prevent the popover from opening/closing
    toggleItem(item)
  }

  return (
    <div className={cn("w-full", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        {/* The Trigger: This is the button that shows the selected badges */}
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={isOpen}
            className="w-full justify-between h-auto min-h-10 whitespace-normal"
            onClick={() => setIsOpen(!isOpen)}
          >
            <div className="flex flex-wrap items-center gap-1">
              {/* Render all the selected item badges */}
              {selectedItems.length > 0 ? (
                selectedItems.map((item) => (
                  <Button
                    key={item}
                    variant="secondary"
                    className="font-normal"
                  >
                    {item}
                    {/* The 'X' button on each badge */}
                    <span
                      aria-label={`Remove ${item}`}
                      onClick={(e) => handleDeselect(e, item)}
                      className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleDeselect(e as any, item)
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </span>
                  </Button>
                ))
              ) : (
                // Show placeholder if no items are selected
                <span className="text-muted-foreground font-normal">
                  {placeholder}
                </span>
              )}
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        {/* The Content: This is the popover that holds the search and list */}
        <PopoverContent 
          className="w-[--radix-popover-trigger-width] p-0"
          onCloseAutoFocus={(e) => e.preventDefault()} // Prevents focus jump
        >
          <Command
            // Filter based on search value. Default `cmdk` behavior is great.
            filter={(value, search) => {
              return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput 
              placeholder={searchPlaceholder} 
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup>
                {/* Map over all available items */}
                {items.map((item) => {
                  const isSelected = selectedItems.includes(item)
                  return (
                    <CommandItem
                      key={item}
                      // When an item is selected from the list
                      onSelect={() => {
                        toggleItem(item)
                        // Clear search input after selection
                        setSearchValue("")
                      }}
                      className="cursor-pointer"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {item}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

