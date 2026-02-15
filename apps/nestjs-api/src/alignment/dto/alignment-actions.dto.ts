import { Expose } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Max,
} from "class-validator";

export class SyncPexelsDto {
  @Expose({ name: "searchQuery" })
  @IsOptional()
  @IsString()
  searchQuery?: string = "nature";

  @Expose({ name: "batchSize" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  batchSize?: number = 50;
}

export class TestAnalysisDto {
  @Expose({ name: "image_url" })
  @IsString()
  @IsUrl()
  imageUrl: string;
}
