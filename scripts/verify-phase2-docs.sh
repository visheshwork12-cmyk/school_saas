#!/bin/bash
# scripts/verify-phase2-docs.sh

echo "🔍 Phase 2 Documentation Verification"

# Check if all required files exist
required_files=(
    "docs/architecture/system-design.md"
    "docs/architecture/database-schema.md" 
    "docs/architecture/multi-tenancy.md"
    "docs/architecture/scalability.md"
    "docs/architecture/security-model.md"
    "docs/architecture/subscription-model.md"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        missing_files+=("$file")
        echo "❌ Missing: $file"
    else
        echo "✅ Found: $file"
    fi
done

if [[ ${#missing_files[@]} -eq 0 ]]; then
    echo "🎉 All Phase 2 documentation files present!"
else
    echo "⚠️  Missing ${#missing_files[@]} files"
fi

# Check content quality
echo "\n📊 Content Analysis:"
for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        word_count=$(wc -w < "$file")
        line_count=$(wc -l < "$file")
        echo "$file: $word_count words, $line_count lines"
    fi
done
