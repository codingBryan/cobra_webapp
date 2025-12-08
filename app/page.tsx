"use client"
import { ActivityTrendChart } from "@/components/ActivityTrendChart";
import { DateRangeDialog } from "@/components/DateRangeDialog";
import { DateRangePicker } from "@/components/DateRangePicker";
import { GradeStrategyToggle } from "@/components/GradeStrategyToggle";
import { LossGainComparison } from "@/components/LossGainComparison";
import { StockActivityChart } from "@/components/StockActivityChart";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InitializedActivityRecords, ProcessSummary, StockData, StockSummary } from "@/custom_utilities/custom_types";
import { useEffect, useRef, useState } from "react";
import { MultiSelectCombobox } from '@/components/MultiSelectCombobox';
import { Button } from '@/components/ui/button';
import { initialize_daily_summary, initialize_grade_strategy_activity_records } from '@/lib/sti_processing_utils';
import { stringify } from 'node:querystring';
import { Sumana } from 'next/font/google';
import { FileDropDialog } from '@/components/FileDropDialog';
import { Interface } from "node:readline";


interface StockActivityUpdateData{
  new_activities_data?:InitializedActivityRecords
  summary_id:number,
  stock_data:StockData
}
export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState({
    current_stock_file: null as File | null,
    processing_analysis_file: null as File | null,
    sti_file: null as File | null,
    gdi_file: null as File | null,
    sta_file: null as File | null,
    test_details_summary_file: null as File | null,
    ghost_batches_file: null as File | null,
    misc_file: null as File | null,
  });

  const  handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>,fileKey: keyof typeof uploadedFiles,) => {


    console.log("New file uploaded: ", fileKey)
    const file = event.target.files ? event.target.files[0] : null;
    setUploadedFiles((prevFiles) => ({
      ...prevFiles,
      [fileKey]: file,
    }));

    
  };

  
  const [all_stock_items, set_all_stock_items] = useState<string[]>(["AA", "AB", "ABC", "UG1", "UG2","REJECTS", "PB", ])
  const [selected_stock_items, setSelectedItems] = useState<string[]>([]);
  const [undefined_file_drop_visible, set_undefined_file_drop_visible] = useState<boolean>(false)

  const [latestSummary, setLatestSummary] = useState<StockSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatestStockSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Calls the endpoint you created
      const response = await fetch('/api/daily_summary'); 
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.statusText}`);
      }
     

      const data = await response.json();
      console.log(data)
      // Your API returns an array, even for LIMIT 1
      if (Array.isArray(data) && data.length > 0) {
        setLatestSummary(data[0]);
      } else {
        setLatestSummary(null); // No summary found
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
      console.error("Error fetching stock summary:", err);
    } finally {
      setIsLoading(false);
    }
  };


  const ToggleFileDropVisibility = () => {
    set_undefined_file_drop_visible(!undefined_file_drop_visible);
  }
  const HandleUpdateGhostBatches = async () => {
    if (!uploadedFiles.ghost_batches_file || !uploadedFiles.misc_file) {
        alert("Please Upload Ghost Batchses file.");
        return;
    }


    const form_data = new FormData();
    form_data.append("ghost_batches_file", uploadedFiles.ghost_batches_file);
    form_data.append("misc_file", uploadedFiles.misc_file)

    try {
        const response = await fetch('/api/test_endpoint', {
          method: 'POST',
          body: form_data,
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to process file.");
        }

        console.log("Successfully updated ghost batches");

      } catch (error) {
        console.error("Error in STI processing:", error);
      }
  };

  const HandleGenerateReportClick = async () => {
    const since_date:Date = new Date(2024, 0, 1)

    let summary_id:number = 0;
    // if(summary_id === 0){
    //   // Show override modal If yes, delete daily summary and create a new one,If no Just cancel the operation and od nothing
    //   return;
    // }
    // const delivered_weight:number = await processStiFile(since_date, uploadedFiles.sti_file)
    // console.log("The delivered quantity is", delivered_weight)

    if (!uploadedFiles.sti_file || !uploadedFiles.gdi_file || !uploadedFiles.sta_file || !uploadedFiles.current_stock_file || !uploadedFiles.processing_analysis_file || !uploadedFiles.test_details_summary_file) {
        alert("Please select a file.");
        return;
    }

    try {
      const response = await fetch('/api/create_summary', {
        method: 'GET',
      });
      const result = await response.json();
      if (!response.ok) {
          throw new Error(result.error || "Failed to process file.");
      }
      
      else if (result === 0 ) {
        throw new Error(result.error || "Failed to Initialize daily summary.");
      }

      summary_id = result.summary_id;

    } catch (error) {
      console.error("Error in STI processing:", error);
    }

     // 1. Create FormData to send the file and date
    const formData = new FormData();
    formData.append("summary_id", summary_id.toString());
    formData.append("targetDate", since_date.toISOString());
    formData.append("stiFile", uploadedFiles.sti_file);
    formData.append("gdiFile", uploadedFiles.gdi_file);
    formData.append("staFile", uploadedFiles.sta_file);
    formData.append("current_stock", uploadedFiles.current_stock_file);
    formData.append("processing_analysis_file", uploadedFiles.processing_analysis_file);
    formData.append("test_details_summary_file", uploadedFiles.test_details_summary_file);
  

    let processing_summary_object:ProcessSummary | undefined = undefined;
    let outbound_weight:number | undefined = undefined;
    let inbound_weight:number | undefined = undefined;
    let adjustment_weight:number = 0;
    let closing_quantity_xbs:number | undefined = undefined;
    let xbs_current_stock_report:StockData | undefined = undefined;

    let new_activity: InitializedActivityRecords | undefined = undefined;

    
    try {
      console.log("Processing STI file...");
      try {
        const response = await fetch('/api/process_sti', {
          method: 'POST',
          body: formData,
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to process file.");
        }
        // 3. Get the total from the API response
        inbound_weight = result.total_delivered_qty;
        console.log("Successfully processed STI file, total:", inbound_weight);

      } catch (error) {
        console.error("Error in STI processing:", error);
      }
      

      console.log("Processing GDI file...");
      try {
        const response = await fetch('/api/process_gdi', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
        throw new Error(result.error || "Failed to process GDI file.");
        }

      const groupedData = result.groupedData;
      outbound_weight = groupedData.totalOutbound;
      console.log("Successfully processed GDI file, grouped data:", groupedData);

      } catch (error) {
      console.error("Error in GDI processing:", error);
      }

      console.log("Processing STA file...");
      try {
        const response = await fetch('/api/process_sta', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
        throw new Error(result.error || "Failed to process STA file.");
        }

      const groupedData = result;


      adjustment_weight = groupedData.totalAdjustment;
      console.log("Successfully processed STA file, grouped data:", groupedData);

      } catch (error) {
      console.error("Error in STA processing:", error);
      }


      console.log("Processing Current Stock file...");
      try {
        const response = await fetch('/api/stock_movement', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        console.log(result);

        if (!response.ok) {
          throw new Error("Failed to process Current Stock file.");
        }

        // closing_quantity_xbs = result['current_stock_summary'].total_closing_balance

        xbs_current_stock_report = result['current_stock_summary'];
        console.log("Successfully processed Current Stock file, Stock summary:", result);

      } catch (error) {
        console.error("Error in Current Stock processing:", error);
      }


        console.log("Processing Processing Analysis file...");
        try {
          const response = await fetch('/api/process_pa', {
            method: 'POST',
            body: formData,
          });

          const result : ProcessSummary = await response.json();
          processing_summary_object = result

          if (!response.ok) {
          throw new Error("Failed to process Processing analysis file.");
          }

        const processing_summary = result;
        console.log("Successfully processed Processing analysis file, grouped data:", processing_summary);

        } catch (error) {
        console.error("Error in Processing analysis processing:", error);
        }

    } catch (error) {
        console.error("Error in HandleGenerateReportClick:", error);
    }

    // console.log("Crucial data");
    // console.log("processing_summary_object",processing_summary_object);
    // console.log("outbound_weight",outbound_weight);
    // console.log("inbound_weight",inbound_weight);
    // console.log("XBS REPORT",xbs_current_stock_report);


    if (processing_summary_object!=undefined && outbound_weight!=undefined && inbound_weight!=undefined && xbs_current_stock_report!=undefined) {
      try{
        console.log("Calling Summary aggregation endpont: /api/create_summary...");
        const summaryResponse = await fetch('/api/create_summary', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            summary_id:summary_id,
            targetDate: since_date,
            process_summary: processing_summary_object,
            inbound_weight: inbound_weight, 
            outbound_weight: outbound_weight,
            adjustment_weight: adjustment_weight,
            xbs_current_stock_report: xbs_current_stock_report,
          }),
          });

          const new_activity: InitializedActivityRecords = await summaryResponse.json();
          if (!summaryResponse.ok) {
            throw new Error("Summary creation OR Activity initialization failed");
          }

          console.log("Successful summary creation and activity initialization:", new_activity);
          try {
          

            // 1. Construct the data object
            const dataToSend : StockActivityUpdateData = {
                summary_id: summary_id,
                stock_data: xbs_current_stock_report,
            };

            // Conditionally add new_activities_data if it exists
            if (new_activity != null) {
                dataToSend.new_activities_data = new_activity;
            }

            // 2. Send the data as JSON
            const response = await fetch('/api/update_stock_activities', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json', // <--- REQUIRED: Tells the server to expect JSON
                },
                body: JSON.stringify(dataToSend), // <--- REQUIRED: Send the stringified JSON object
            });

            const result: ProcessSummary = await response.json();
            
            if (!response.ok) {
                throw new Error("Failed to process Processing analysis file.");
            }

            const processing_summary = result;
            console.log("Successfully processed Processing analysis file, grouped data:", processing_summary);

        } catch (error) {
            console.error("Error in Updating stock activities:", error);
        }
                  
        // Refresh the summary on screen
        fetchLatestStockSummary();

      } catch (error) {
      console.error("Error in HandleGenerateReportClick:", error);
              alert(`Error: ${(error as Error).message}`);
      } finally {
            setIsLoading(false);
      }
      console.log("Updating undefined strategies")
       try {
        const response = await fetch('/api/update_undefined_strategies', {
            method: 'POST',
            body:formData
        });
        const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Failed to Update UNDEFINED strategies");
            }

            try {
              const response = await fetch('/api/update_post_stacks', {
                method: 'POST',
                body: formData,
              });

              const result : any = await response.json();

              if (!response.ok) {
              throw new Error("Failed to Update post stacks.");
              }

            console.log("Successfully updated post stacks:", result);

            // const response_test = await fetch('/api/test_endpoint', {method: 'GET'});


            // const ghost_hunt_response = await fetch('/api/batches/ghost_hunt', {method: 'GET'})
 

          } catch (error) {
          console.error("Error in Updating post stacks:", error);
          }
          

        } catch (error) {
            console.error("Update UNDEFINED strategies:", error);
        }



      
          
    }else{
      throw new Error("missing crucial daily summary data point")
    }
  }
     

  useEffect(() => {
    fetchLatestStockSummary();
   
  }, []); // The empty array [] means this runs only once on mount

  return (
    <div className="flex flex-col w-full h-auto p-4">
      <div className='w-full mb-1'>
        <div className="div flex justify-between">
          <h1 className=''>Kenyacof Daily Stock Movement</h1>

          <div>
            <div className="flex justify-between">
              <FileDropDialog file_type='current_stock'></FileDropDialog>
              <FileDropDialog file_type='purchase_sheet'></FileDropDialog>
            </div>
          </div>
          
          

          
          
        </div>
      </div>
      
      <div className="flex w-full h-full gap-3">

        {/* Left side */}
        <div className="flex-4/12 h-full">


          <Card className="w-full h-full">
            <CardHeader>
              <div className="flex flex-col justify-between items-start gap-4">
                <h3>Activity summary</h3>
                <div className='w-full'>
                  <div className="w-full flex justify-between gap-4">
                    <div className="flex-3/12">
                      <GradeStrategyToggle/>
                    </div>
                    

                    <div className="flex-6/12">
                      <MultiSelectCombobox
                          items={all_stock_items}
                          selectedItems={selected_stock_items}
                          setSelectedItems={setSelectedItems}
                          placeholder="Select stock"
                          searchPlaceholder="Search fruits..."
                        />
                    </div>
                      
                    <div className="flex-6/12">
                      <DateRangeDialog />
                    </div>
                  </div>
                </div>

              </div>

            </CardHeader>

            <CardContent>

              <div className="flex flex-col gap-1.5">

                <div className="flex items-center">
                  <div className="flex-2/12">open</div>
                  <div className="flex-8/12">
                    <StockActivityChart activity_data={latestSummary} />
                  </div>

                  <div className="flex-2/12">close</div>
                </div>
                <div className="flex flex-col">
                  <div className="flex justify-between">
                    <span className="">Inbound</span>
                    <span className=" font-bold">{latestSummary?.total_inbound_qty} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">Processing Input</span>
                    <span className=" font-bold">{latestSummary?.total_to_processing_qty} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">Processing output</span>
                    <span className=" font-bold">{latestSummary?.total_from_processing_qty} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">outbound</span>
                    <span className=" font-bold">{latestSummary?.total_outbound_qty} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">processing loss/gain</span>
                    <span className=" font-bold">{latestSummary?.total_loss_gain_qty} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">millling loss</span>
                    <span className=" font-bold">{latestSummary?.milling_loss} MT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="">adjustment</span>
                    <span className=" font-bold">{latestSummary?.total_stock_adjustment_qty} MT</span>
                  </div>

                </div>

                <Card>
                  <CardHeader>PNL</CardHeader>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right side */}
        <div className="flex-8/12">
          <ActivityTrendChart />

          <div id="upload_section" className="flex gap-1">
            <div className="flex-9/12">
              <Card>
                <CardHeader>
                  <h5>Loss distribution</h5>
                </CardHeader>
                <CardContent>
                  {/* <LossGainComparison /> */}
                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="ghost_batches_file">GHOST Batches</Label>
                    <Input
                      id="ghost_batches_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'ghost_batches_file')}
                    />
                  </div>


                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="misc_file">Misc</Label>
                    <Input
                      id="misc_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'misc_file')}
                    />
                  </div>



                  <div className="grid w-full max-w-sm items-center gap-3">
                   <Button onClick={HandleUpdateGhostBatches}>Update Ghost batches</Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex-3/12">
              <Card>
                <CardHeader>
                  <h5>XBS File uploads</h5>
                </CardHeader>
                <CardContent>

                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="current_stock_file">Current Stock</Label>
                    <Input
                      id="current_stock_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'current_stock_file')}
                    />
                  </div>

                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="processing_analysis_file">Processing Analysis</Label>
                    <Input
                      id="processing_analysis_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'processing_analysis_file')}
                    />
                  </div>

                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="sti_file">Stock Transfer Instruction Summary</Label>
                    <Input
                      id="sti_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'sti_file')}
                    />
                  </div>

                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="gdi_file">Goods Dispatch report</Label>
                    <Input
                      id="gdi_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'gdi_file')}
                    />
                  </div>
                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="stock_adjustment_file">Stock Adjustment report</Label>
                    <Input
                      id="stock_adjustment_file"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'sta_file')}
                    />
                  </div>

                  <div className="grid w-full max-w-sm items-center gap-3">
                    <Label htmlFor="test_details_summary">Test Details Summary report</Label>
                    <Input
                      id="test_details_summary"
                      type="file"
                      onChange={(e) => handleFileChange(e, 'test_details_summary_file')}
                    />
                  </div>

                  <div className="grid w-full max-w-sm items-center gap-3">
                   <Button onClick={HandleGenerateReportClick} >Generate report</Button>
                  </div>

                  


                </CardContent>

              </Card>

            </div>


          </div>

        </div>

      </div>


    </div>
  );
}


