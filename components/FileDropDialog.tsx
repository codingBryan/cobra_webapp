"use client"

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
import FileDropZone from "./FileDropZone"
import PurchaseSheetDropZone from "./PurchaseSheetUpload"

export function FileDropDialog(props:{file_type:string}) {

  if (props.file_type == "purchase_sheet") {
    return (
      <Dialog>
        <form>
          <DialogTrigger asChild>
            <Button variant="outline">Sync Catalogue Summaries</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>

            <DialogTitle>
                Upload the required files here
            </DialogTitle>
            <DialogDescription>
              
            </DialogDescription>
  
            </DialogHeader>
              <PurchaseSheetDropZone/>
          </DialogContent>
        </form>
      </Dialog>
  )
  }else{
     return (
      <Dialog>
        <form>
          <DialogTrigger asChild>
            <Button variant="outline">Update undefined strategies</Button>
          </DialogTrigger>
          <DialogContent className="w-[80%]">
            <DialogHeader>
              <DialogTitle></DialogTitle>
              <DialogDescription>
                Upload as many Current Stock Files (Traders or All reports)S as you can.
              </DialogDescription>
            </DialogHeader>
              <FileDropZone/>
          </DialogContent>
        </form>
      </Dialog>
    )
  };
 
}
