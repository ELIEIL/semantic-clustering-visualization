// Topic detection based on keywords in user's post
function detectTopicFromContent(content) {
    const text = content.toLowerCase();
    
    // Politics keywords
    if (text.match(/gun|rights|constitution|conservative|liberal|democrat|republican|vote|election|government|policy|law|freedom|immigration|border|healthcare|abortion/)) {
        return 'politics';
    }
    
    // Climate keywords
    if (text.match(/climate|warming|carbon|emission|renewable|fossil|environment|green|sustainability|pollution|energy/)) {
        return 'climate';
    }
    
    // Technology keywords
    if (text.match(/tech|ai|artificial intelligence|privacy|data|surveillance|encryption|algorithm|software|digital|computer/)) {
        return 'technology';
    }
    
    // Economy keywords
    if (text.match(/economy|capitalism|socialism|tax|wealth|income|market|trade|business|corporate|money|finance/)) {
        return 'economy';
    }
    
    // Default to politics if no clear match
    return 'politics';
}

module.exports = { detectTopicFromContent };
