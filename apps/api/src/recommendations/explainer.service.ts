import { Injectable } from '@nestjs/common';
import { RecommendationRequestDto } from './dto/recommendation-request.dto';
import { ScoredContractor } from './recommendation.types';
import { explanationEvidence, renderExplanation } from './explanation-evidence';
@Injectable()
export class ExplainerService {
  explain(candidate: ScoredContractor, request: RecommendationRequestDto, rank: number, peers: ScoredContractor[] = []): string {
    void rank;
    return renderExplanation(candidate.contractor, request, explanationEvidence(candidate.contractor, request, peers.map((peer) => peer.contractor))[0]);
  }
}
