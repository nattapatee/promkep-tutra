# PromKep-Tutra 2.0: Mascot Edition + Group System

## Mascot Analysis

### Character: "ตุ๊ต๊ะ" (Tutra)
- White round face/body with cute smile
- Green sprout on top of head (growth/prosperity)
- Pink blush cheeks
- Muscular arms (strong debt collector)
- Black shirt with pink heart badge
- Holding phone (finance app) and spiked club (debt enforcement)
- Piggy bank, coins, cash nearby
- Sad rock character "หนี้ ไม่จ่าย" (debt won't pay)

### Color Palette
```css
/* Primary Colors */
--color-sprout: #7CB342;        /* Green sprout */
--color-sprout-light: #AED581;  /* Light green */
--color-sprout-dark: #558B2F;   /* Dark green */

/* Character Colors */
--color-face: #FFFFFF;          /* White face */
--color-cheek: #F48FB1;         /* Pink cheeks */
--color-cheek-light: #F8BBD0;   /* Light pink */

/* UI Colors */
--color-shirt: #212121;         /* Black shirt */
--color-shirt-light: #424242;   /* Dark gray */
--color-heart: #E91E63;         /* Pink heart badge */
--color-heart-light: #F06292;   /* Light pink */

/* Background */
--color-bg-cream: #FFF8E1;      /* Cream background */
--color-bg-warm: #FFECB3;       /* Warm yellow */
--color-bg-pink: #FCE4EC;       /* Soft pink */

/* Accents */
--color-gold: #FFD700;          /* Coins */
--color-gold-dark: #FFA000;     /* Dark gold */
--color-coin: #FFC107;          /* Coin yellow */
```

### Design Direction
- Cute but muscular (cute aggression for debt collection)
- Round, soft UI elements matching mascot shape
- Green sprout motifs throughout
- Pink accents for buttons and highlights
- Black for text and strong elements
- Cream/warm backgrounds

## Features to Build

### 1. LINE Bot Command: Reset Command
**Trigger**: User types "มะม่วงสีเขียวกินนกสีขาว"
**Action**: 
- Delete ALL data from database
- Reset rich menus
- Show confirmation message with mascot

### 2. Group System

#### Database Schema
```prisma
model Group {
  id          String   @id @default(uuid())
  name        String
  code        String   @unique  // 6-digit code
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])
  members     GroupMember[]
  transactions Transaction[]
  debts       DebtRequest[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model GroupMember {
  id        String   @id @default(uuid())
  groupId   String
  group     Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String   @default("member") // admin, member
  joinedAt  DateTime @default(now())
  
  @@unique([groupId, userId])
}

// Update existing models
model Transaction {
  // ... existing fields
  groupId   String?
  group     Group?   @relation(fields: [groupId], references: [id])
}

model DebtRequest {
  // ... existing fields
  groupId   String?
  group     Group?   @relation(fields: [groupId], references: [id])
}
```

#### API Endpoints
```
POST   /groups              - Create group (returns 6-digit code)
GET    /groups              - List my groups
POST   /groups/join         - Join group with code
GET    /groups/:id          - Get group details
GET    /groups/:id/members  - List group members
DELETE /groups/:id/leave    - Leave group
DELETE /groups/:id          - Delete group (admin only)
PATCH  /groups/:id          - Update group name
```

#### Features
- Create group → auto-generate unique 6-digit code
- Join group → enter 6-digit code
- View group members (for debt/money requests)
- Group-scoped transactions and debts
- Admin can kick members

### 3. Debt/Money Request Improvements
- Select group first
- Show only group members
- Group-scoped debt tracking
- Group balance summary

### 4. PromptPay QR Fix
**Current Issue**: 400 error when generating QR
**Fix**: 
- Check PromptPay ID format (phone number or national ID)
- Validate amount
- Use correct PromptPay QR spec (Tag 30)
- Add ability to generate "Pay" QR (for receiving money)

### 5. UI Redesign

#### Global Changes
- Update color scheme to mascot palette
- Rounder corners (matching mascot shape)
- Green sprout icons/accents
- Pink buttons with black text
- Cream/warm backgrounds

#### New Pages
- `/groups` - Group list
- `/groups/new` - Create group
- `/groups/join` - Join group
- `/groups/:id` - Group details

#### Animations
- Bouncing mascot on load
- Coin drop animation on transaction
- Club swing animation on debt reminder
- Confetti with green sprout shape

#### Components
- Mascot avatar component
- Group card component
- Member list component
- QR code display component

## Implementation Order

### Phase 1: Foundation
1. Update database schema (Prisma migration)
2. Create group API routes
3. Update debt/transaction routes to support groups
4. Fix PromptPay QR generation

### Phase 2: Web UI
1. Update global styles (colors, fonts)
2. Create group pages
3. Update dashboard with group context
4. Add mascot animations

### Phase 3: LINE Bot
1. Add reset command
2. Add group management commands
3. Update rich menu for groups
4. Update debt flow to use groups

### Phase 4: Polish
1. Test all flows
2. Add loading animations
3. Error handling
4. Deploy
