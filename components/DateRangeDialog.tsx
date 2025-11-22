import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DateRangePicker } from "./DateRangePicker"

export function DateRangeDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Pick a date range</Button>
      </DialogTrigger>
      <DialogContent className="w-auto p-3 ">
        <DialogHeader>
          <DialogTitle>Select date range</DialogTitle>
          {/* <DialogDescription>
            Anyone who has this link will be able to view this.
          </DialogDescription> */}
        </DialogHeader>
        <DateRangePicker/>
        <DialogFooter className="sm:justify-start">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
