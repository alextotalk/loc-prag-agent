import { IsString, MaxLength, MinLength } from 'class-validator';

/** Input guardrail: the raw natural-language request from the user. */
export class SearchRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  query: string;
}
