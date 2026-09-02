import { parseSettlement } from '../server/services/settlementParse.js';

const win9a = `*종료 /  (박은새)
어카운트 :  WN 480-8
바이인 :  300,000
캐시아웃 :  410,000
윈로스 :  +110,000
롤링 :  1,191,000
커미션 :  17,860
어카운트 잔액 :  535,640`;

const win9b = `* 게임종료 / 정산 *
계정 Account  WN 480-8  (박은새)  정승식
바이인 Buy-in 300,000
캐시아웃 합계 Total Cashout  :  410,000
윈/로스 Win/Loss : 110,000
토탈롤링 Total Rolling : 1,191,000
커미션 Commission : 17,860
잔고:  535,640
날짜 Date : 8/25/2026
시간 Time : 5:10:13 AM`;

const galaxyClean = `END GAME
GALAXY
8/24/2026 0:55
ACCOUNT NO. 어카운트 번호 G101 WS-A
AGENT NAME 에이전트 이름 SUNG NAKJIN
PLAYER NAME 플레이어 이름 SUNG JOONHONG/ JUNGWONG YEUM/YONG PYO HONG
GAME NO. 게임 번호 #681
TOTAL BUY-IN 총 바이인 1,015,000
CHIP RETURN 칩 리턴 DP CO 244,500
WIN/LOSS 윈로스 770,500
ROLLING 롤링 2,372,000
ROLLING COMMI 롤링 커미션 35,580
AMOUNT TO PAY 차감 후 금액 35,580`;

const galaxyOcr = `8/24/2026 0:55
ACCOUNT NO.
어카운트 번호 G101 WS-A
AGENT NAME
에이전트 이름 SUNG NAKJIN
PLAYER NAME SUNG JOONHONG/ JUNGWONG
플레이어 이름 YEUM/YONG PYO HONG
GAME NO.
게임 번호 #681
TOTAL BUY-IN
= 바 이 인 1,015,000
DP
칩 리턴
60 244,500
Pe
롤러, 아바타, 딜러 ©
WIN/LOSS
윈 로스 770,500
ROLLING
롤링 2,372,000
=
ROLLING COMMI
35,580
FNB / CIGAR
FNB/ El /AVA FEE
AMOUNT TO PAY
CAGE CASHIER
담당자 WENN/MARICAR/DAI
담당`;

const demoCageStart = `Demo Cage

Game Start *

Account: 3core - raynan
Game #: 5 - Live
Buy-in: 200,000 - Account Withdrawal
Balance: 800,750

Date: 5/13/2026
Time: 9:32:17 PM`;

const demoCageAddBuyin = `Demo Cage

Additional Buy-in *

Account: 3core - raynan
Game #: 5 - Live
Buy-in: 50,000 - Account Withdrawal
Total Buy-in: 250,000
Balance: 750,750

Date: 5/13/2026
Time: 9:33:35 PM`;

const demoCageCashout = `Demo Cage

Cashout *

Account: 3core - raynan
Game #: 5 - Live
Cashout: 200,000 - Account Deposit
Balance: 950,750

Date: 5/13/2026
Time: 9:34:38 PM`;

const demoCageEnd = `Demo Cage

Game End / Settlement *

Account: 3core - raynan
Game #: 5
Game Type: Live
Commission: 750 - Account Deposit
Balance: 951,500

Total Buy-in: 250,000
Total Cashout: 200,000
Win/Loss: -50,000
Total Rolling: 50,000

Date: 5/13/2026
Time: 9:35:10 PM`;

for (const [name, text] of [
  ['win9a', win9a],
  ['win9b', win9b],
  ['galaxyClean', galaxyClean],
  ['galaxyOcr', galaxyOcr],
  ['demoCageStart', demoCageStart],
  ['demoCageAddBuyin', demoCageAddBuyin],
  ['demoCageCashout', demoCageCashout],
  ['demoCageEnd', demoCageEnd],
]) {
  console.log('\n===', name, '===');
  console.log(JSON.stringify(parseSettlement(text), null, 2));
}
